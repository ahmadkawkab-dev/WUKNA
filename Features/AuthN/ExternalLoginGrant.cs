namespace Wukna.Features.Auth;

using Wukna.Features.Users;

/// <summary>
/// Stores the server-side state for a short-lived, single-use external-login exchange code.
/// Only hashes are persisted so a database read cannot reveal a usable browser credential.
/// </summary>
public sealed class ExternalLoginGrant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public string CodeHash { get; set; } = string.Empty;
    public string BrowserBindingHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
