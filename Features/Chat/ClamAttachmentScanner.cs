namespace Wukna.Features.Chat;

using Microsoft.Extensions.Options;
using Wukna.Shared.FileSecurity;

public enum AttachmentScanVerdict { Clean, Infected }
public interface IAttachmentScanner
{
    Task<AttachmentScanVerdict> ScanAsync(Stream content, CancellationToken ct);
}

public sealed class ClamAttachmentScanner(IOptions<ChatAttachmentOptions> options) : IAttachmentScanner
{
    public async Task<AttachmentScanVerdict> ScanAsync(Stream content, CancellationToken ct) =>
        await ClamScanClient.IsCleanAsync(content, options.Value.ClamHost, options.Value.ClamPort,
            options.Value.ClamTimeoutSeconds,
            Math.Max(options.Value.MaxFileBytes, Math.Max(options.Value.MaxImageBytes, options.Value.MaxPreviewBytes)), ct)
            ? AttachmentScanVerdict.Clean : AttachmentScanVerdict.Infected;
}
