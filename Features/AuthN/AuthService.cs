namespace Lapis.Features.Auth;

using Lapis.Features.Auth.DTOs;
using Lapis.Features.Users;
using Lapis.Shared.Data.AppDbContext;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

public sealed class AuthService(
    LapisDbContext db,
    UserManager<User> userManager,
    SignInManager<User> signInManager,
    SessionIssuer sessionIssuer,
    TimeProvider timeProvider)
{
    public async Task<(AuthResponseDto? Response, string[] Errors)> RegisterAsync(
        RegisterRequestDto request,
        HttpResponse response,
        CancellationToken cancellationToken)
    {
        var email = request.Email.Trim();
        var user = new User { UserName = email, Email = email };

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return (null, result.Errors.Select(error => error.Description).ToArray());
        }

        var session = await sessionIssuer.IssueAsync(user, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        sessionIssuer.SetRefreshCookie(response, session);
        return (session.Response, []);
    }

    public async Task<AuthResponseDto?> LoginAsync(
        LoginRequestDto request,
        HttpResponse response,
        CancellationToken cancellationToken)
    {
        var user = await userManager.FindByEmailAsync(request.Email.Trim());
        if (user is null)
        {
            return null;
        }

        var result = await signInManager.CheckPasswordSignInAsync(
            user, request.Password, lockoutOnFailure: true);
        if (!result.Succeeded)
        {
            return null;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var lockedUser = await LockUserAsync(user.Id, cancellationToken);
        if (lockedUser is null)
        {
            return null;
        }

        var session = await sessionIssuer.IssueAsync(lockedUser, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        sessionIssuer.SetRefreshCookie(response, session);
        return session.Response;
    }

    public async Task<AuthResponseDto?> RefreshAsync(
        string? rawToken,
        HttpResponse response,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return null;
        }

        var hash = sessionIssuer.HashRefreshToken(rawToken);
        var existing = await db.RefreshTokens.AsNoTracking()
            .SingleOrDefaultAsync(token => token.TokenHash == hash, cancellationToken);
        if (existing is null)
        {
            return null;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var user = await LockUserAsync(existing.UserId, cancellationToken);
        if (user is null)
        {
            return null;
        }

        var now = timeProvider.GetUtcNow();
        var changed = await db.RefreshTokens
            .Where(token => token.Id == existing.Id && !token.IsRevoked && token.ExpiredAt > now)
            .ExecuteUpdateAsync(
                updates => updates.SetProperty(token => token.IsRevoked, true),
                cancellationToken);
        if (changed != 1)
        {
            return null;
        }

        var session = await sessionIssuer.IssueAsync(user, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        sessionIssuer.SetRefreshCookie(response, session);
        return session.Response;
    }

    public async Task LogoutAsync(string? rawToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return;
        }

        var hash = sessionIssuer.HashRefreshToken(rawToken);
        await db.RefreshTokens
            .Where(token => token.TokenHash == hash && !token.IsRevoked)
            .ExecuteUpdateAsync(
                updates => updates.SetProperty(token => token.IsRevoked, true),
                cancellationToken);
    }

    public async Task<int> LogoutEverywhereAsync(Guid userId, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var user = await LockUserAsync(userId, cancellationToken);
        if (user is null)
        {
            return 0;
        }

        var changed = await db.RefreshTokens
            .Where(token => token.UserId == userId && !token.IsRevoked)
            .ExecuteUpdateAsync(
                updates => updates.SetProperty(token => token.IsRevoked, true),
                cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return changed;
    }

    private Task<User?> LockUserAsync(Guid userId, CancellationToken cancellationToken) =>
        db.Users
            // The user-row lock serializes refresh rotation with logout-everywhere.
            // Handwritten SQL must use the mapped snake_case table and column names.
            .FromSqlInterpolated($"SELECT * FROM asp_net_users WHERE id = {userId} FOR UPDATE")
            .AsNoTracking()
            .SingleOrDefaultAsync(cancellationToken);
}
