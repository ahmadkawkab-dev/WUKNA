namespace Lapis.Features.Auth;

using System.Security.Cryptography;
using System.Diagnostics.CodeAnalysis;
using System.Text;
using Lapis.Features.Auth.DTOs;
using Lapis.Features.Users;
using Lapis.Shared.Data.AppDbContext;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

public sealed record ExternalExchangeResult(
    AuthResponseDto? Response,
    string? ErrorCode);

/// <summary>
/// Creates the short-lived credential used to hand a resolved external identity back to React.
/// Session issuance occurs only after the browser exchanges this credential successfully.
/// </summary>
public sealed class ExternalLoginGrantService(
    LapisDbContext db,
    SessionIssuer sessionIssuer,
    TimeProvider timeProvider,
    IHostEnvironment environment)
{
    public const string BrowserBindingCookieName = "lapis.external.binding";
    public const string ExchangePath = "/api/auth/external/exchange";
    public const string CodeExpired = "external_login_code_expired";
    public const string CodeInvalid = "external_login_code_invalid";
    private static readonly TimeSpan GrantLifetime = TimeSpan.FromMinutes(3);

    public async Task<string> CreateAsync(
        User user,
        HttpResponse response,
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var expiresAt = now.Add(GrantLifetime);
        var code = CreateRandomCredential();
        var browserBinding = CreateRandomCredential();

        db.ExternalLoginGrants.Add(new ExternalLoginGrant
        {
            UserId = user.Id,
            CodeHash = HashCredential(code),
            BrowserBindingHash = HashCredential(browserBinding),
            CreatedAt = now,
            ExpiresAt = expiresAt
        });
        await db.SaveChangesAsync(cancellationToken);

        // The opaque code may travel through the URL, but it is unusable without this
        // separate HttpOnly browser credential and expires after a few minutes.
        response.Cookies.Append(
            BrowserBindingCookieName,
            browserBinding,
            CreateBrowserBindingCookieOptions(expiresAt));

        return code;
    }

    public async Task<ExternalExchangeResult> ExchangeAsync(
        string? code,
        string? browserBinding,
        HttpResponse response,
        CancellationToken cancellationToken)
    {
        if (!IsExpectedCredential(code) || !IsExpectedCredential(browserBinding))
        {
            return InvalidExchange();
        }

        var codeHash = HashCredential(code);
        var browserBindingHash = HashCredential(browserBinding);
        var now = timeProvider.GetUtcNow();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // This conditional UPDATE is the security decision. Concurrent requests can both know
        // the credentials, but PostgreSQL permits only one of them to change consumed_at.
        var changed = await db.ExternalLoginGrants
            .Where(grant =>
                grant.CodeHash == codeHash &&
                grant.BrowserBindingHash == browserBindingHash &&
                grant.ConsumedAt == null &&
                grant.ExpiresAt > now)
            .ExecuteUpdateAsync(
                updates => updates.SetProperty(grant => grant.ConsumedAt, now),
                cancellationToken);

        if (changed != 1)
        {
            // This read only chooses a stable error after the atomic update failed. It does not
            // participate in deciding whether the credential may be consumed.
            var isExpired = await db.ExternalLoginGrants.AsNoTracking().AnyAsync(
                grant =>
                    grant.CodeHash == codeHash &&
                    grant.BrowserBindingHash == browserBindingHash &&
                    grant.ConsumedAt == null &&
                    grant.ExpiresAt <= now,
                cancellationToken);

            return new ExternalExchangeResult(
                null,
                isExpired ? CodeExpired : CodeInvalid);
        }

        var user = await db.ExternalLoginGrants.AsNoTracking()
            .Where(grant =>
                grant.CodeHash == codeHash &&
                grant.BrowserBindingHash == browserBindingHash)
            .Select(grant => grant.User)
            .SingleOrDefaultAsync(cancellationToken);
        if (user is null)
        {
            return InvalidExchange();
        }

        // Grant consumption and refresh-token persistence commit together. If session creation
        // fails, disposing the transaction restores the grant to its unconsumed state.
        var session = await sessionIssuer.IssueAsync(user, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        sessionIssuer.SetRefreshCookie(response, session);

        return new ExternalExchangeResult(session.Response, null);
    }

    public string HashCredential(string credential) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(credential)));

    public void DeleteBrowserBindingCookie(HttpResponse response) =>
        response.Cookies.Delete(
            BrowserBindingCookieName,
            CreateBrowserBindingCookieOptions(expires: null));

    private static string CreateRandomCredential() =>
        WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    private static bool IsExpectedCredential([NotNullWhen(true)] string? value) =>
        value is { Length: 43 } &&
        value.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_');

    private CookieOptions CreateBrowserBindingCookieOptions(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        Secure = !environment.IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        IsEssential = true,
        Path = ExchangePath,
        Expires = expires
    };

    private static ExternalExchangeResult InvalidExchange() => new(null, CodeInvalid);
}
