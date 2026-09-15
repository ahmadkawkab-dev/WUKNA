namespace Lapis.Features.Auth;

using System.Security.Cryptography;
using System.Text;
using Lapis.Features.Auth.DTOs;
using Lapis.Features.Users;
using Lapis.Shared.Data.AppDbContext;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

public sealed record AuthSession(
    AuthResponseDto Response,
    string RefreshToken,
    DateTimeOffset RefreshExpiresAt);

public sealed class AuthService(
    LapisDbContext db,
    UserManager<User> userManager,
    SignInManager<User> signInManager,
    JwtTokenGenerator tokenGenerator,
    JwtOptions options)
{
    public async Task<(AuthSession? Session, string[] Errors)> RegisterAsync(
        RegisterRequestDto request,
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

        var session = await IssueSessionAsync(user, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return (session, []);
    }

    public async Task<AuthSession?> LoginAsync(
        LoginRequestDto request,
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

        var session = await IssueSessionAsync(lockedUser, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return session;
    }

    public async Task<AuthSession?> RefreshAsync(
        string? rawToken,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return null;
        }

        var hash = HashToken(rawToken);
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

        var now = DateTimeOffset.UtcNow;
        var changed = await db.RefreshTokens
            .Where(token => token.Id == existing.Id && !token.IsRevoked && token.ExpiredAt > now)
            .ExecuteUpdateAsync(
                updates => updates.SetProperty(token => token.IsRevoked, true),
                cancellationToken);
        if (changed != 1)
        {
            return null;
        }

        var session = await IssueSessionAsync(user, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return session;
    }

    public async Task LogoutAsync(string? rawToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return;
        }

        var hash = HashToken(rawToken);
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

    private async Task<AuthSession> IssueSessionAsync(User user, CancellationToken cancellationToken)
    {
        var rawRefreshToken = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(64));
        var refreshExpiresAt = DateTimeOffset.UtcNow.AddDays(options.RefreshTokenDays);
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = HashToken(rawRefreshToken),
            ExpiredAt = refreshExpiresAt
        });
        await db.SaveChangesAsync(cancellationToken);

        var (accessToken, accessExpiresAt) = tokenGenerator.CreateAccessToken(user);
        var response = new AuthResponseDto(
            accessToken,
            accessExpiresAt,
            new UserSummaryDto(user.Id, user.Email ?? string.Empty));
        return new AuthSession(response, rawRefreshToken, refreshExpiresAt);
    }

    private Task<User?> LockUserAsync(Guid userId, CancellationToken cancellationToken) =>
        db.Users
            // The user-row lock serializes refresh rotation with logout-everywhere.
            // Handwritten SQL must use the mapped snake_case table and column names.
            .FromSqlInterpolated($"SELECT * FROM asp_net_users WHERE id = {userId} FOR UPDATE")
            .AsNoTracking()
            .SingleOrDefaultAsync(cancellationToken);

    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
