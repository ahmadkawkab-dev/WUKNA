namespace Wukna.Features.Auth;

using Microsoft.AspNetCore.WebUtilities;

public sealed class GoogleOAuthSettings
{
    public const string SectionName = "Authentication:Google";
    public const string AuthenticationScheme = "Google";
    public const string EmailVerifiedClaim = "wukna:google:email_verified";
    public const string ProviderCallbackPath = "/api/auth/external/google/provider-callback";
    public const string ApplicationCallbackPath = "/api/auth/external/google/callback";
    public const string LinkCallbackPath = "/api/auth/external/google/link/callback";
    private const string FrontendCallbackPath = "/auth/callback";

    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string FrontendBaseUrl { get; set; } = string.Empty;

    public string BuildFrontendSuccessRedirect(string code) =>
        QueryHelpers.AddQueryString(BuildFrontendCallbackUrl(), "code", code);

    public string BuildFrontendErrorRedirect(string errorCode) =>
        QueryHelpers.AddQueryString(BuildFrontendCallbackUrl(), "error", errorCode);

    public string BuildFrontendLinkedRedirect() =>
        QueryHelpers.AddQueryString(BuildFrontendCallbackUrl(), "linked", "google");

    private string BuildFrontendCallbackUrl() =>
        $"{FrontendBaseUrl.TrimEnd('/')}{FrontendCallbackPath}";
}
