namespace Lapis.Features.Auth;

using Lapis.Features.Users;
using Lapis.Shared.Data.AppDbContext;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

public sealed record GoogleLinkResult(bool Succeeded, string? ErrorCode);

/// <summary>
/// Links a validated Google provider identity to an already-authenticated LAPIS user.
/// The provider key's Identity primary key prevents ownership by two users.
/// </summary>
public sealed class GoogleAccountLinkService(
    LapisDbContext db,
    UserManager<User> userManager)
{
    public const string AlreadyLinked = "external_login_already_linked";
    public const string CannotRemoveOnlyLogin = "cannot_remove_only_login";

    public async Task<GoogleLinkResult> LinkAsync(User user, ExternalLoginInfo loginInfo)
    {
        if (!GoogleLoginService.HasValidGoogleIdentity(loginInfo))
            return Failed();

        await using var transaction = await db.Database.BeginTransactionAsync();
        var lockedUser = await db.Users
            .FromSqlInterpolated($"SELECT * FROM asp_net_users WHERE id = {user.Id} FOR UPDATE")
            .AsNoTracking()
            .SingleOrDefaultAsync();
        if (lockedUser is null ||
            !string.Equals(lockedUser.SecurityStamp, user.SecurityStamp, StringComparison.Ordinal))
            return Failed();

        var existing = await userManager.FindByLoginAsync(
            loginInfo.LoginProvider, loginInfo.ProviderKey);
        if (existing is not null)
            return existing.Id == user.Id ? Success() : Conflict();

        // A LAPIS account currently supports one Google identity. The user-row lock keeps
        // simultaneous callbacks for two different Google accounts from both passing this check.
        var userLogins = await userManager.GetLoginsAsync(user);
        if (userLogins.Any(login =>
                login.LoginProvider == GoogleOAuthSettings.AuthenticationScheme))
            return Conflict();

        try
        {
            var result = await userManager.AddLoginAsync(user, loginInfo);
            if (result.Succeeded)
            {
                await transaction.CommitAsync();
                return Success();
            }

            if (result.Errors.Any(error => error.Code == "LoginAlreadyAssociated"))
            {
                await transaction.RollbackAsync();
                return await ResolveConcurrentLinkAsync(user, loginInfo);
            }

            return Failed();
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException
               { SqlState: PostgresErrorCodes.UniqueViolation,
                 ConstraintName: "pk_asp_net_user_logins" })
        {
            // Another callback won the provider-key race. Read its owner after the failed
            // insert rather than trusting the earlier application-level check.
            await transaction.RollbackAsync();
            return await ResolveConcurrentLinkAsync(user, loginInfo);
        }
    }

    public async Task<GoogleLinkResult> UnlinkAsync(
        Guid authenticatedUserId,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // Serialize the last-login check with changes to this Identity user. The login row is
        // selected from Identity, never from a provider key supplied by the browser.
        var user = await db.Users
            .FromSqlInterpolated($"SELECT * FROM asp_net_users WHERE id = {authenticatedUserId} FOR UPDATE")
            .SingleOrDefaultAsync(cancellationToken);
        if (user is null)
            return Failed();

        var logins = await userManager.GetLoginsAsync(user);
        var googleLogins = logins.Where(login =>
            login.LoginProvider == GoogleOAuthSettings.AuthenticationScheme).ToArray();
        if (googleLogins.Length == 0)
            return Success();
        if (googleLogins.Length != 1)
            return Failed();

        var googleLogin = googleLogins[0];

        var hasPassword = await userManager.HasPasswordAsync(user);
        var hasAnotherExternalLogin = logins.Any(login =>
            login.LoginProvider != GoogleOAuthSettings.AuthenticationScheme);
        if (!hasPassword && !hasAnotherExternalLogin)
            return new GoogleLinkResult(false, CannotRemoveOnlyLogin);

        var removed = await userManager.RemoveLoginAsync(
            user,
            googleLogin.LoginProvider,
            googleLogin.ProviderKey);
        if (!removed.Succeeded)
            return Failed();

        // Invalidates any outstanding protected link-intent cookie for this account.
        var stampUpdated = await userManager.UpdateSecurityStampAsync(user);
        if (!stampUpdated.Succeeded)
            return Failed();

        await transaction.CommitAsync(cancellationToken);
        return Success();
    }

    private async Task<GoogleLinkResult> ResolveConcurrentLinkAsync(
        User user,
        ExternalLoginInfo loginInfo)
    {
        var owner = await userManager.FindByLoginAsync(
            loginInfo.LoginProvider, loginInfo.ProviderKey);
        return owner?.Id == user.Id ? Success() : Conflict();
    }

    private static GoogleLinkResult Success() => new(true, null);
    private static GoogleLinkResult Conflict() => new(false, AlreadyLinked);
    private static GoogleLinkResult Failed() =>
        new(false, GoogleLoginService.ExternalLoginFailed);
}
