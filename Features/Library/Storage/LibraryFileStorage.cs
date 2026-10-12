namespace Wukna.Features.Library;

using System.Net;
using System.Text.RegularExpressions;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

// Only generated private keys cross this boundary. No public URL or presigning API.
public interface ILibraryFileStorage
{
    Task Put(string key, Stream content, string contentType, CancellationToken ct);
    Task<byte[]> Read(string key, long maximumBytes, CancellationToken ct);
    Task Delete(string key, CancellationToken ct);
    Task<bool> Exists(string key, CancellationToken ct);
}

public sealed partial class SeaweedLibraryFileStorage : ILibraryFileStorage, IDisposable
{
    private readonly AmazonS3Client client;
    private readonly LibraryStorageOptions options;
    public SeaweedLibraryFileStorage(IOptions<LibraryStorageOptions> configured)
    {
        options = configured.Value;
        client = new AmazonS3Client(new BasicAWSCredentials(options.Enabled ? options.AccessKey : "disabled", options.Enabled ? options.SecretKey : "disabled"), new AmazonS3Config
        {
            ServiceURL = options.Endpoint, ForcePathStyle = true, AuthenticationRegion = options.Region,
            MaxErrorRetry = 0, Timeout = TimeSpan.FromSeconds(options.ObjectTimeoutSeconds),
            HttpClientFactory = new PrivateStorageHttpClientFactory(),
            RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
            ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED,
        });
    }
    [GeneratedRegex("^library/(quarantine|available)/[0-9a-f]{32}$", RegexOptions.CultureInvariant)]
    private static partial Regex KeyPattern();
    private void Check(string key)
    {
        LibraryAccess.Require(options.Enabled, LibraryErrors.StorageUnavailable, 503);
        LibraryAccess.Require(KeyPattern().IsMatch(key), LibraryErrors.InvalidItem);
    }
    private CancellationTokenSource Deadline(CancellationToken ct)
    {
        var token = CancellationTokenSource.CreateLinkedTokenSource(ct);
        token.CancelAfter(TimeSpan.FromSeconds(options.ObjectTimeoutSeconds)); return token;
    }
    public async Task Put(string key, Stream content, string contentType, CancellationToken ct)
    {
        Check(key); using var deadline = Deadline(ct);
        await client.PutObjectAsync(new PutObjectRequest { BucketName = options.Bucket, Key = key,
            InputStream = content, ContentType = contentType, AutoCloseStream = false,
            UseChunkEncoding = false }, deadline.Token);
    }
    public async Task<byte[]> Read(string key, long maximumBytes, CancellationToken ct)
    {
        Check(key); using var deadline = Deadline(ct);
        using var response = await client.GetObjectAsync(options.Bucket, key, deadline.Token);
        if (response.ContentLength <= 0 || response.ContentLength > maximumBytes) throw new IOException("library_object_size");
        using var output = new MemoryStream(); var buffer = new byte[65536];
        while (true)
        {
            var read = await response.ResponseStream.ReadAsync(buffer, deadline.Token); if (read == 0) break;
            if (output.Length + read > maximumBytes) throw new IOException("library_object_size");
            await output.WriteAsync(buffer.AsMemory(0, read), deadline.Token);
        }
        if (output.Length != response.ContentLength) throw new IOException("library_object_incomplete");
        return output.ToArray();
    }
    public async Task Delete(string key, CancellationToken ct)
    {
        Check(key); using var deadline = Deadline(ct);
        await client.DeleteObjectAsync(options.Bucket, key, deadline.Token);
        if (await Exists(key, ct)) throw new IOException("library_delete_unconfirmed");
    }
    public async Task<bool> Exists(string key, CancellationToken ct)
    {
        Check(key); using var deadline = Deadline(ct);
        try { await client.GetObjectMetadataAsync(options.Bucket, key, deadline.Token); return true; }
        catch (AmazonS3Exception error) when (error.StatusCode == HttpStatusCode.NotFound && error.ErrorCode is "NoSuchKey" or "NotFound") { return false; }
    }
    public void Dispose() => client.Dispose();

    private sealed class PrivateStorageHttpClientFactory : Amazon.Runtime.HttpClientFactory
    {
        public override HttpClient CreateHttpClient(IClientConfig config) => new(new SocketsHttpHandler
        {
            AllowAutoRedirect = false, UseCookies = false, ConnectTimeout = TimeSpan.FromSeconds(3),
            PooledConnectionLifetime = TimeSpan.FromSeconds(30), PooledConnectionIdleTimeout = TimeSpan.FromSeconds(10),
        }) { DefaultRequestVersion = HttpVersion.Version11, DefaultVersionPolicy = HttpVersionPolicy.RequestVersionExact,
            Timeout = Timeout.InfiniteTimeSpan };
    }
}
