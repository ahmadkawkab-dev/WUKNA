namespace Wukna.Features.Library;

using Wukna.Features.Users;

public enum StorageEntitlementSource { Free = 0, Subscription = 1, Manual = 2 }

// All Library writes coordinate through this row; paid grants remain disabled.
public sealed class StorageEntitlement
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public long QuotaBytes { get; set; } = LibraryOptions.DefaultFreeQuotaBytes;
    public StorageEntitlementSource Source { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class LibraryOptions
{
    public const long DefaultFreeQuotaBytes = 1_000_000_000;
    public long FreeQuotaBytes { get; set; } = DefaultFreeQuotaBytes;
    public int MaxFileBytes { get; set; } = 20_000_000;
    public int MaxTextBytes { get; set; } = 256_000;
    public int ReservationSeconds { get; set; } = 900;
    public bool ReservationCleanupEnabled { get; set; } = true;
    public int ReadRequestsPerMinute { get; set; } = 240;
    public int WriteRequestsPerMinute { get; set; } = 120;
    public int ProviderRequestsPerMinute { get; set; } = 30;
    public bool IsValid() => FreeQuotaBytes is > 0 and <= DefaultFreeQuotaBytes && MaxFileBytes is > 0 and <= 20_000_000 &&
        MaxTextBytes is > 0 and <= 256_000 && MaxTextBytes <= MaxFileBytes &&
        ReservationSeconds is >= 60 and <= 86400 && ReadRequestsPerMinute is >= 1 and <= 10000 &&
        WriteRequestsPerMinute is >= 1 and <= 10000 && ProviderRequestsPerMinute is >= 1 and <= 10000;
}
