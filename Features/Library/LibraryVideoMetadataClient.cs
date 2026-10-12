namespace Wukna.Features.Library;

using System.Text.Json;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Memory;

public sealed record LibraryVideoMetadata(string? Title, string? Creator, string? Thumbnail, string? Error);

public sealed class LibraryVideoMetadataClient(IHttpClientFactory clients)
{
    private readonly SemaphoreSlim concurrency = new(4, 4);
    private readonly DecoderOptions decoder = CreateDecoder();
    private static DecoderOptions CreateDecoder()
    {
        var configuration = Configuration.Default.Clone(); configuration.MaxDegreeOfParallelism = 2;
        configuration.MemoryAllocator = MemoryAllocator.Create(new MemoryAllocatorOptions { AllocationLimitMegabytes = 64, MaximumPoolSizeMegabytes = 16 });
        return new DecoderOptions { Configuration = configuration, MaxFrames = 2 };
    }
    public static bool SafeThumbnail(LibraryVideoProvider provider, string? value)
    {
        if (value is null || value.Length > 2048 || value.Any(char.IsControl) || !Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            uri.Scheme != "https" || !uri.IsDefaultPort || uri.UserInfo.Length != 0) return false;
        return provider == LibraryVideoProvider.Youtube ? uri.IdnHost == "i.ytimg.com" && uri.AbsolutePath.StartsWith("/vi/", StringComparison.Ordinal) :
            provider == LibraryVideoProvider.Vimeo && uri.IdnHost == "i.vimeocdn.com" && uri.AbsolutePath.StartsWith("/video/", StringComparison.Ordinal);
    }
    public async Task<LibraryVideoMetadata> Fetch(LibraryVideoReference reference, CancellationToken ct)
    {
        if (reference.Provider == LibraryVideoProvider.External) return new(null, null, null, null);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct); deadline.CancelAfter(TimeSpan.FromSeconds(5));
        var acquired = false;
        try
        {
            await concurrency.WaitAsync(deadline.Token); acquired = true;
            var endpoint = reference.Provider == LibraryVideoProvider.Youtube ? "https://www.youtube.com/oembed?format=json&url=" : "https://vimeo.com/api/oembed.json?url=";
            using var client = clients.CreateClient("library-video-provider");
            using var response = await client.GetAsync(endpoint + Uri.EscapeDataString(reference.Url), HttpCompletionOption.ResponseHeadersRead, deadline.Token);
            if (!response.IsSuccessStatusCode || response.Content.Headers.ContentType?.MediaType != "application/json") return new(null, null, null, "library_video_metadata_unavailable");
            var bytes = await Bounded(response.Content, 32768, deadline.Token);
            using var json = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 8 });
            var root = json.RootElement;
            var title = Text(root, "title"); var creator = Text(root, "author_name");
            var thumbnail = root.TryGetProperty("thumbnail_url", out var image) && image.ValueKind == JsonValueKind.String ? image.GetString() : null;
            if (!SafeThumbnail(reference.Provider, thumbnail)) thumbnail = null;
            return new(title, creator, thumbnail, null);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception error) when (error is HttpRequestException or IOException or JsonException or OperationCanceledException or InvalidOperationException)
        { return new(null, null, null, "library_video_metadata_unavailable"); }
        finally { if (acquired) concurrency.Release(); }
    }
    public async Task<IResult> Thumbnail(string url, LibraryVideoProvider provider, HttpContext context, CancellationToken ct)
    {
        LibraryAccess.Require(SafeThumbnail(provider, url), LibraryErrors.ProcessingUnavailable, 503);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct); deadline.CancelAfter(TimeSpan.FromSeconds(5));
        var acquired = false;
        try
        {
            await concurrency.WaitAsync(deadline.Token); acquired = true;
            using var client = clients.CreateClient("library-video-provider");
            using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, deadline.Token);
            if (!response.IsSuccessStatusCode) throw new IOException();
            var mediaType = response.Content.Headers.ContentType?.MediaType;
            if (mediaType is not ("image/jpeg" or "image/png" or "image/webp")) throw new IOException();
            var bytes = await Bounded(response.Content, 1_000_000, deadline.Token);
            using var stream = new MemoryStream(bytes, false); var info = await Image.IdentifyAsync(decoder, stream, deadline.Token);
            if (info is null || info.Width <= 0 || info.Height <= 0 || (long)info.Width * info.Height > 4_000_000 || info.FrameMetadataCollection.Count > 1) throw new IOException();
            var detected = info.Metadata.DecodedImageFormat?.DefaultMimeType;
            if (detected != mediaType) throw new IOException();
            stream.Position = 0;
            using var image = await Image.LoadAsync(decoder, stream, deadline.Token);
            if (image.Frames.Count != 1) throw new IOException();
            image.Mutate(operation => operation.Resize(new ResizeOptions { Mode = ResizeMode.Max, Size = new Size(640, 360) }));
            image.Metadata.ExifProfile = null; image.Metadata.IccProfile = null; image.Metadata.XmpProfile = null; image.Metadata.IptcProfile = null;
            using var output = new MemoryStream(); await image.SaveAsPngAsync(output, deadline.Token);
            if (output.Length > 1_000_000) throw new IOException();
            // Recheck authorization in the endpoint after this bounded provider call.
            context.Response.Headers.ContentSecurityPolicy = "default-src 'none'; sandbox";
            return Results.File(output.ToArray(), "image/png");
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception error) when (error is HttpRequestException or IOException or OperationCanceledException or UnknownImageFormatException or InvalidImageContentException or InvalidMemoryOperationException or NotSupportedException)
        { throw new LibraryFailure(LibraryErrors.ProcessingUnavailable, 503); }
        finally { if (acquired) concurrency.Release(); }
    }
    private static string? Text(JsonElement root, string key)
    {
        if (!root.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.String) return null;
        var text = string.Concat((value.GetString() ?? "").EnumerateRunes().Where(rune => !System.Text.Rune.IsControl(rune)).Take(200).Select(rune => rune.ToString())).Trim();
        return text.Length == 0 ? null : text;
    }
    private static async Task<byte[]> Bounded(HttpContent content, int maxBytes, CancellationToken ct)
    {
        if (content.Headers.ContentLength > maxBytes) throw new IOException();
        await using var input = await content.ReadAsStreamAsync(ct); using var output = new MemoryStream();
        var buffer = new byte[8192]; int read;
        while ((read = await input.ReadAsync(buffer, ct)) > 0)
        { if (output.Length + read > maxBytes) throw new IOException(); await output.WriteAsync(buffer.AsMemory(0, read), ct); }
        return output.ToArray();
    }
}
