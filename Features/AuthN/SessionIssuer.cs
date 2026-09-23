namespace Wukna.Features.Auth;

using System.Security.Cryptography;
using System.Text;
using Wukna.Features.Auth.DTOs;
using Wukna.Features.Users;
using Wukna.Shared.Data.AppDbContext;
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
    WuknaDbContext db,
    JwtTokenGenerator tokenGenerator,
    JwtOptions options,
    TimeProvider timeProvider,
    IHostEnvironment environment)
{
    internal const string RefreshCookieName = "wukna.refresh";
    // Accepted for one-time migration of active browser sessions from the former cookie name.
    internal const string LegacyRefreshCookieName = "lapis.refresh";
    private const string RefreshCookiePath = "/api/auth";

    internal static string? ReadRefreshCookie(HttpRequest request) =>
        request.Cookies[RefreshCookieName] ?? request.Cookies[LegacyRefreshCookieName];

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
            new UserSummaryDto(
                user.Id,
                user.Email ?? string.Empty,
                user.Username,
                user.DisplayName,
                ProfileImageUrls.For(user.ProfileImageKey, user.ProfileImageVersion),
                user.ProfileImageVersion));

        return new IssuedSession(response, rawRefreshToken, refreshExpiresAt);
    }

    public string HashRefreshToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public void SetRefreshCookie(HttpResponse response, IssuedSession session)
    {
        var cookieOptions = CreateRefreshCookieOptions();
        cookieOptions.Expires = session.RefreshExpiresAt;
        response.Cookies.Append(RefreshCookieName, session.RefreshToken, cookieOptions);
        response.Cookies.Delete(LegacyRefreshCookieName, CreateRefreshCookieOptions());
    }

    public void DeleteRefreshCookie(HttpResponse response)
    {
        response.Cookies.Delete(RefreshCookieName, CreateRefreshCookieOptions());
        response.Cookies.Delete(LegacyRefreshCookieName, CreateRefreshCookieOptions());
    }

    private CookieOptions CreateRefreshCookieOptions() => new()
    {
        HttpOnly = true,
        Secure = !environment.IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        Path = RefreshCookiePath
    };
}
