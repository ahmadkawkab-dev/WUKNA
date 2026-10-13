namespace Wukna.Features.Library;

public sealed class LibraryStorageOptions
{
    public bool Enabled { get; set; }
    public string Endpoint { get; set; } = "http://seaweedfs:8333";
    public string Bucket { get; set; } = "wukna-library";
    public string AccessKey { get; set; } = string.Empty;
    public string SecretKey { get; set; } = string.Empty;
    public string Region { get; set; } = "us-east-1";
    public string QuarantineDirectory { get; set; } = "App_Data/library-quarantine";
    public string ClamHost { get; set; } = "clamd";
    public int ClamPort { get; set; } = 3310;
    public int ClamTimeoutSeconds { get; set; } = 60;
    public int TransferTimeoutSeconds { get; set; } = 180;
    public int ObjectTimeoutSeconds { get; set; } = 30;
    public int MaxConcurrentTransfers { get; set; } = 2;
    public bool WorkerEnabled { get; set; } = true;
    public bool IsValid() => !Enabled ||
        Uri.TryCreate(Endpoint, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" &&
        uri.UserInfo.Length == 0 && uri.Query.Length == 0 && uri.Fragment.Length == 0 &&
        uri.AbsolutePath == "/" && Bucket is { Length: >= 3 and <= 63 } &&
        Bucket.All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c == '-') &&
        AccessKey.Length > 0 && SecretKey.Length >= 32 && Region.Length > 0 &&
        !string.IsNullOrWhiteSpace(QuarantineDirectory) && !string.IsNullOrWhiteSpace(ClamHost) &&
        ClamPort is > 0 and <= 65535 && ClamTimeoutSeconds is >= 5 and <= 120 &&
        TransferTimeoutSeconds is >= 60 and <= 300 && ObjectTimeoutSeconds is >= 5 and <= 60 &&
        MaxConcurrentTransfers is >= 1 and <= 4;
}

public interface ILibraryScanner
{
    Task<bool> IsClean(Stream content, CancellationToken ct);
}

public sealed class LibraryClamScanner(Microsoft.Extensions.Options.IOptions<LibraryStorageOptions> options,
    Microsoft.Extensions.Options.IOptions<LibraryOptions> library) : ILibraryScanner
{
    public Task<bool> IsClean(Stream content, CancellationToken ct) =>
        Wukna.Shared.FileSecurity.ClamScanClient.IsCleanAsync(content, options.Value.ClamHost,
            options.Value.ClamPort, options.Value.ClamTimeoutSeconds,
            Math.Max(library.Value.MaxFileBytes, LibraryReservations.ThumbnailBudgetBytes), ct);
}

// Fail fast instead of allocating unbounded simultaneous buffers, decoders and temp files.
public sealed class LibraryTransferGate(Microsoft.Extensions.Options.IOptions<LibraryStorageOptions> options)
{
    public SemaphoreSlim Slots { get; } = new(options.Value.MaxConcurrentTransfers, options.Value.MaxConcurrentTransfers);
}
