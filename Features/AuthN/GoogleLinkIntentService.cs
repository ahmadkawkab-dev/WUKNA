namespace Lapis.Features.Auth;

using System.Security.Cryptography;
using System.Text.Json;
using Lapis.Features.Users;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;

/// <summary>
/// Carries the already-authenticated LAPIS user through browser navigation to Google.
/// The browser cannot choose a user ID because the payload is protected on the server.
/// </summary>
public sealed class GoogleLinkIntentService
{
    public const string CookieName = "lapis.google.link_intent";
    private const string CookiePath = "/api/auth/external/google";
    private const string Purpose = "link-google-login";
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    private readonly IDataProtector _protector;
    private readonly UserManager<User> _userManager;
    private readonly TimeProvider _timeProvider;
    private readonly IHostEnvironment _environment;

    private sealed record LinkIntent(
        string Purpose,
        Guid UserId,
        string SecurityStamp,
        DateTimeOffset ExpiresAt);

    public GoogleLinkIntentService(
        IDataProtectionProvider dataProtectionProvider,
        UserManager<User> userManager,
        TimeProvider timeProvider,
        IHostEnvironment environment)
    {
        _protector = dataProtectionProvider.CreateProtector(
            "Lapis.Features.Auth.GoogleLinkIntent", "v1");
        _userManager = userManager;
        _timeProvider = timeProvider;
        _environment = environment;
    }

    public async Task<bool> CreateAsync(
        Guid authenticatedUserId,
        HttpResponse response)
    {
        var user = await _userManager.FindByIdAsync(authenticatedUserId.ToString());
        if (user is null)
            return false;

        var securityStamp = await _userManager.GetSecurityStampAsync(user);
        if (string.IsNullOrEmpty(securityStamp))
            return false;

        var expiresAt = _timeProvider.GetUtcNow().Add(Lifetime);
        var payload = new LinkIntent(Purpose, user.Id, securityStamp, expiresAt);
        var protectedValue = _protector.Protect(JsonSerializer.Serialize(payload));
        response.Cookies.Append(CookieName, protectedValue, CookieOptions(expiresAt));
        return true;
    }

    public async Task<User?> ValidateAsync(HttpRequest request)
    {
        if (!request.Cookies.TryGetValue(CookieName, out var protectedValue) ||
            string.IsNullOrWhiteSpace(protectedValue))
            return null;

        LinkIntent? intent;
        try
        {
            intent = JsonSerializer.Deserialize<LinkIntent>(
                _protector.Unprotect(protectedValue));
        }
        catch (Exception exception) when (exception is
               CryptographicException or JsonException or FormatException)
        {
            return null;
        }

        if (intent is null ||
            intent.Purpose != Purpose ||
            intent.UserId == Guid.Empty ||
            string.IsNullOrEmpty(intent.SecurityStamp) ||
            intent.ExpiresAt <= _timeProvider.GetUtcNow())
            return null;

        var user = await _userManager.FindByIdAsync(intent.UserId.ToString());
        if (user is null)
            return null;

        var currentStamp = await _userManager.GetSecurityStampAsync(user);
        return string.Equals(currentStamp, intent.SecurityStamp, StringComparison.Ordinal)
            ? user
            : null;
    }

    public void Delete(HttpResponse response) =>
        response.Cookies.Delete(CookieName, CookieOptions(expires: null));

    private CookieOptions CookieOptions(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        Secure = !_environment.IsDevelopment(),
        SameSite = SameSiteMode.Lax,
        IsEssential = true,
        Path = CookiePath,
        Expires = expires
    };
}
