namespace Lapis.Features.Auth;

using System.Security.Cryptography;
using System.Text;
using Lapis.Features.Auth.DTOs;
using Lapis.Features.Users;
using Lapis.Shared.Data.AppDbContext;
using Microsoft.AspNetCore.WebUtilities;

public sealed record IssuedSession(
    AuthResponseDto Response,
    string RefreshToken,
    DateTimeOffset RefreshExpiresAt);

/// <summary>
/// Creates application sessions independently of how the user's identity was established.
/// Local-password and external-provider flows must both use this component.
/// </summary>
public sealed class SessionIssuer(
    LapisDbContext db,
    JwtTokenGenerator tokenGenerator,
    JwtOptions options,
    TimeProvider timeProvider,
    IHostEnvironment environment)
{
    internal const string RefreshCookieName = "lapis.refresh";
    private const string RefreshCookiePath = "/api/auth";

    public async Task<IssuedSession> IssueAsync(User user, CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var rawRefreshToken = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(64));
        var refreshExpiresAt = now.AddDays(options.RefreshTokenDays);

        // Only the hash is persisted. The plaintext credential exists only long enough to
        // place it in the HttpOnly refresh cookie after the transaction commits.
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = HashRefreshToken(rawRefreshToken),
            ExpiredAt = refreshExpiresAt
        });
        await db.SaveChangesAsync(cancellationToken);

        var (accessToken, accessExpiresAt) = tokenGenerator.CreateAccessToken(user);
        var response = new AuthResponseDto(
            accessToken,
            accessExpiresAt,
            new UserSummaryDto(user.Id, user.Email ?? string.Empty));

        return new IssuedSession(response, rawRefreshToken, refreshExpiresAt);
    }

    public string HashRefreshToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public void SetRefreshCookie(HttpResponse response, IssuedSession session)
    {
        var cookieOptions = CreateRefreshCookieOptions();
        cookieOptions.Expires = session.RefreshExpiresAt;
        response.Cookies.Append(RefreshCookieName, session.RefreshToken, cookieOptions);
    }

    public void DeleteRefreshCookie(HttpResponse response) =>
        response.Cookies.Delete(RefreshCookieName, CreateRefreshCookieOptions());

    private CookieOptions CreateRefreshCookieOptions() => new()
    {
        HttpOnly = true,
        Secure = !environment.IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        Path = RefreshCookiePath
    };
}
