namespace Lapis.Features.Auth;

using System.Security.Claims;
using Lapis.Features.Users;
using Lapis.Shared.Data.AppDbContext;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

public sealed record GoogleLoginResolution(User? User, string? ErrorCode)
{
    public bool Succeeded => User is not null;
}

/// <summary>
/// Converts Google's validated external principal into one LAPIS user identity.
/// Application-session issuance remains the responsibility of <see cref="SessionIssuer"/>.
/// </summary>
public sealed class GoogleLoginService(
    LapisDbContext db,
    UserManager<User> userManager,
    ILogger<GoogleLoginService> logger)
{
    public const string AccountLinkRequired = "account_link_required";
    public const string ExternalLoginFailed = "external_login_failed";

    public async Task<GoogleLoginResolution> ResolveUserAsync(
        ExternalLoginInfo loginInfo,
        CancellationToken cancellationToken)
    {
        if (!HasValidGoogleIdentity(loginInfo))
        {
            // Log only claim presence, never provider keys, email addresses, or token values.
            logger.LogWarning(
                "Google external ticket validation failed. ProviderValid={ProviderValid}, " +
                "KeyPresent={KeyPresent}, EmailPresent={EmailPresent}, VerifiedClaimPresent={VerifiedClaimPresent}.",
                loginInfo.LoginProvider == GoogleOAuthSettings.AuthenticationScheme,
                !string.IsNullOrWhiteSpace(loginInfo.ProviderKey),
                !string.IsNullOrWhiteSpace(loginInfo.Principal.FindFirstValue(ClaimTypes.Email)),
                loginInfo.Principal.HasClaim(claim =>
                    claim.Type == GoogleOAuthSettings.EmailVerifiedClaim));
            return Failed();
        }

        var email = loginInfo.Principal.FindFirstValue(ClaimTypes.Email)!.Trim();

        // Provider + provider key is the durable identity. Email is only used when deciding
        // whether creating a new account is safe.
        var linkedUser = await userManager.FindByLoginAsync(
            loginInfo.LoginProvider,
            loginInfo.ProviderKey);
        if (linkedUser is not null)
        {
            return Succeeded(linkedUser);
        }

        // Matching a verified email is insufficient proof that the person owns the existing
        // LAPIS account. They must sign in locally and explicitly link Google instead.
        if (await userManager.FindByEmailAsync(email) is not null)
        {
            return LinkRequired();
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            var user = new User
            {
                UserName = email,
                Email = email,
                // This is only set after the mapped Google verified-email claim was required.
                EmailConfirmed = true
            };

            // Omitting a password intentionally creates a passwordless Identity account.
            var createResult = await userManager.CreateAsync(user);
            if (!createResult.Succeeded)
            {
                if (HasDuplicateIdentityError(createResult))
                {
                    return await ResolveConcurrentWinnerAsync(
                        loginInfo.LoginProvider,
                        loginInfo.ProviderKey,
                        email);
                }

                return Failed();
            }

            var addLoginResult = await userManager.AddLoginAsync(user, loginInfo);
            if (!addLoginResult.Succeeded)
            {
                if (HasDuplicateIdentityError(addLoginResult))
                {
                    await transaction.RollbackAsync(cancellationToken);
                    return await ResolveConcurrentWinnerAsync(
                        loginInfo.LoginProvider,
                        loginInfo.ProviderKey,
                        email);
                }

                return Failed();
            }

            await transaction.CommitAsync(cancellationToken);
            return Succeeded(user);
        }
        catch (DbUpdateException exception) when (IsIdentityUniquenessViolation(exception))
        {
            // Database uniqueness decides concurrent account creation and provider linking.
            // Roll back the failed transaction before reading the winning committed row.
            await transaction.RollbackAsync(cancellationToken);
            return await ResolveConcurrentWinnerAsync(
                loginInfo.LoginProvider,
                loginInfo.ProviderKey,
                email);
        }
    }

    public static bool HasValidGoogleIdentity(ExternalLoginInfo loginInfo) =>
        loginInfo.LoginProvider == GoogleOAuthSettings.AuthenticationScheme &&
        !string.IsNullOrWhiteSpace(loginInfo.ProviderKey) &&
        !string.IsNullOrWhiteSpace(loginInfo.Principal.FindFirstValue(ClaimTypes.Email)) &&
        loginInfo.Principal.FindAll(GoogleOAuthSettings.EmailVerifiedClaim)
            .Any(claim => bool.TryParse(claim.Value, out var verified) && verified);

    private async Task<GoogleLoginResolution> ResolveConcurrentWinnerAsync(
        string loginProvider,
        string providerKey,
        string email)
    {
        var linkedUser = await userManager.FindByLoginAsync(loginProvider, providerKey);
        if (linkedUser is not null)
        {
            return Succeeded(linkedUser);
        }

        return await userManager.FindByEmailAsync(email) is not null
            ? LinkRequired()
            : Failed();
    }

    private static bool HasDuplicateIdentityError(IdentityResult result) =>
        result.Errors.Any(error => error.Code is
            "DuplicateEmail" or
            "DuplicateUserName" or
            "LoginAlreadyAssociated");

    private static bool IsIdentityUniquenessViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation
        };

    private static GoogleLoginResolution Succeeded(User user) => new(user, null);
    private static GoogleLoginResolution LinkRequired() => new(null, AccountLinkRequired);
    private static GoogleLoginResolution Failed() => new(null, ExternalLoginFailed);
}
