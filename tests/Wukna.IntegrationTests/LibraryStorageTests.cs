namespace Wukna.IntegrationTests;

using System.Collections.Concurrent;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using Wukna.Features.Auth;
using Wukna.Features.Library;
using Wukna.Features.Users;
using Xunit;

public sealed class LibraryStorageTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    [Fact]
    public async Task Clean_code_upload_is_private_persistent_downloadable_and_idempotent()
    {
        await using var h = await Harness.Create(postgres);
        var bytes = Encoding.UTF8.GetBytes("const greeting = '<script>escaped</script>';\n");
        var input = Input(bytes, "example.ts"); var session = await Create(h.Owner, input);
        Assert.True((await h.Owner.GetFromJsonAsync<LibraryCapabilitiesDto>("/api/library/capabilities", Ct))!.StorageAvailable);
        using var sent = await Transfer(h.Owner, session.Id, bytes); Assert.Equal(HttpStatusCode.OK, sent.StatusCode);
        var complete = (await sent.Content.ReadFromJsonAsync<LibraryUploadSessionDto>(Ct))!;
        Assert.Equal("complete", complete.State); Assert.Equal(0, complete.ReservedBytes); Assert.NotNull(complete.ItemId);
        var detail = await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{complete.ItemId}", Ct);
        Assert.Equal("code", detail.GetProperty("previewKind").GetString()); Assert.Equal("typescript", detail.GetProperty("language").GetString());
        Assert.Equal($"/api/library/items/{complete.ItemId}/content", detail.GetProperty("contentReference").GetString());
        Assert.Equal(Encoding.UTF8.GetString(bytes), detail.GetProperty("source").GetString());
        Assert.DoesNotContain("StorageKey", detail.GetRawText(), StringComparison.OrdinalIgnoreCase);
        using var content = await h.Owner.GetAsync($"/api/library/items/{complete.ItemId}/content", Ct);
        Assert.Equal(bytes, await content.Content.ReadAsByteArrayAsync(Ct)); Assert.Equal("text/plain", content.Content.Headers.ContentType?.MediaType);
        Assert.Equal("attachment", content.Content.Headers.ContentDisposition?.DispositionType); Assert.Equal("no-store", content.Headers.CacheControl?.ToString());
        using var foreign = await h.Other.GetAsync($"/api/library/items/{complete.ItemId}/content", Ct); Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        using var foreignPut = await Transfer(h.Other, session.Id, bytes); Assert.Equal(HttpStatusCode.NotFound, foreignPut.StatusCode);
        using var replay = await Transfer(h.Owner, session.Id, bytes); Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        using var finalized = await h.Owner.PostAsJsonAsync($"/api/library/uploads/{session.Id}/finalize", new LibraryUploadFinalizeRequest(input.ClientUploadId, input.Checksum), Ct);
        Assert.Equal(complete.ItemId, (await finalized.Content.ReadFromJsonAsync<LibraryUploadSessionDto>(Ct))!.ItemId);
        await using var db = postgres.CreateContext(); Assert.Equal(1, await db.LibraryItems.CountAsync(Ct)); Assert.Equal(1, h.Store!.Puts);
        var storage = (await h.Owner.GetFromJsonAsync<LibraryStorageSummaryDto>("/api/library/storage", Ct))!;
        Assert.Equal(bytes.Length, storage.UsedBytes); Assert.Equal(0, storage.ReservedBytes);
    }
    [Fact]
    public async Task Picture_produces_scanned_png_thumbnail_and_trash_preserves_charge_until_purge_cleanup()
    {
        await using var h = await Harness.Create(postgres); using var image = new Image<Rgba32>(32, 24);
        using var buffer = new MemoryStream(); await image.SaveAsPngAsync(buffer, Ct); var bytes = buffer.ToArray();
        var session = await Create(h.Owner, Input(bytes, "image.png", "picture", "image/png"));
        using var response = await Transfer(h.Owner, session.Id, bytes); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var complete = (await response.Content.ReadFromJsonAsync<LibraryUploadSessionDto>(Ct))!;
        Assert.Equal(2, h.Scanner!.Calls); using var thumb = await h.Owner.GetAsync($"/api/library/items/{complete.ItemId}/thumbnail", Ct);
        Assert.Equal("image/png", thumb.Content.Headers.ContentType?.MediaType);
        using var decoded = Image.Load(await thumb.Content.ReadAsByteArrayAsync(Ct)); Assert.Equal(32, decoded.Width);
        var before = await Usage(h.Owner); Assert.True(before.UsedBytes > bytes.Length);
        using var trash = await Lifecycle(h.Owner, "trash", complete.ItemId!.Value); Assert.Equal(HttpStatusCode.NoContent, trash.StatusCode);
        Assert.Equal(before.UsedBytes, (await Usage(h.Owner)).UsedBytes);
        using var restore = await Lifecycle(h.Owner, "restore", complete.ItemId.Value); Assert.Equal(HttpStatusCode.NoContent, restore.StatusCode);
        using var trashAgain = await Lifecycle(h.Owner, "trash", complete.ItemId.Value);
        using var purge = await Lifecycle(h.Owner, "purge", complete.ItemId.Value); Assert.Equal(HttpStatusCode.NoContent, purge.StatusCode);
        Assert.Equal(before.UsedBytes, (await Usage(h.Owner)).UsedBytes);
        h.Store!.DeleteFails = true; await h.Recover(postgres); Assert.Equal(before.UsedBytes, (await Usage(h.Owner)).UsedBytes);
        h.Store.DeleteFails = false; h.Clock.Advance(TimeSpan.FromMinutes(3)); await h.Recover(postgres);
        Assert.Equal(0, (await Usage(h.Owner)).UsedBytes); Assert.Empty(h.Store.Objects);
        var tombstone = (await h.Owner.GetFromJsonAsync<LibraryUploadSessionDto>($"/api/library/uploads/{session.Id}", Ct))!;
        Assert.True(tombstone.ResultPurged); Assert.Null(tombstone.ItemId);
    }
    [Theory]
    [InlineData("mismatch", 409)]
    [InlineData("truncated", 409)]
    [InlineData("oversized", 409)]
    [InlineData("invalid_utf8", 415)]
    [InlineData("binary_text", 415)]
    [InlineData("fake_pdf", 415)]
    [InlineData("fake_pdf_structure", 415)]
    [InlineData("fake_picture", 415)]
    [InlineData("infected", 422)]
    [InlineData("scan_outage", 503)]
    public async Task Rejected_bytes_never_create_an_item_or_write_an_object(string scenario, int status)
    {
        await using var h = await Harness.Create(postgres);
        var bytes = Encoding.UTF8.GetBytes("sample text"); var sent = bytes; var input = Input(bytes, "file.txt");
        if (scenario == "mismatch") sent = Encoding.UTF8.GetBytes("other bytes");
        if (scenario == "truncated") sent = bytes[..^1];
        if (scenario == "oversized") sent = bytes.Concat(new byte[1]).ToArray();
        if (scenario == "invalid_utf8") { bytes = [0xff, 0xfe, 0]; sent = bytes; input = Input(bytes, "file.txt"); }
        if (scenario == "binary_text") { bytes = [65, 0, 66]; sent = bytes; input = Input(bytes, "file.txt"); }
        if (scenario == "fake_pdf") input = Input(bytes, "file.pdf", type: "application/pdf");
        if (scenario == "fake_pdf_structure") { bytes = Encoding.ASCII.GetBytes("%PDF-1.7\nnot a PDF\nstartxref\n0\n%%EOF\n"); sent = bytes; input = Input(bytes, "file.pdf", type: "application/pdf"); }
        if (scenario == "fake_picture") input = Input(bytes, "file.png", "picture", "image/png");
        if (scenario == "infected") h.Scanner!.Clean = false;
        if (scenario == "scan_outage") h.Scanner!.Unavailable = true;
        var session = await Create(h.Owner, input);
        using var request = new HttpRequestMessage(HttpMethod.Put, $"/api/library/uploads/{session.Id}/content") { Content = new UnknownLengthContent(sent) };
        using var response = await h.Owner.SendAsync(request, Ct); Assert.Equal(status, (int)response.StatusCode);
        await using var db = postgres.CreateContext(); Assert.Empty(await db.LibraryItems.ToArrayAsync(Ct)); Assert.Empty(h.Store!.Objects);
        Assert.Equal(0, h.Store.Puts);
        if ((await Usage(h.Owner)).ReservedBytes > 0)
        {
            // Header length rejection happens before claiming an attempt; the original
            // reservation can still receive the correct file or be safely cancelled.
            using var cancel = await h.Owner.DeleteAsync($"/api/library/uploads/{session.Id}", Ct);
            Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);
        }
        Assert.Equal(0, (await Usage(h.Owner)).ReservedBytes);
        if (Directory.Exists(h.Directory)) Assert.Empty(Directory.EnumerateFiles(h.Directory));
    }
    [Fact]
    public async Task Ambiguous_write_failure_stays_charged_and_recovers_after_a_new_worker_instance()
    {
        await using var h = await Harness.Create(postgres); var bytes = Encoding.UTF8.GetBytes("private file");
        h.Store!.PutFailsAfterWriting = true; var session = await Create(h.Owner, Input(bytes, "file.txt"));
        using var response = await Transfer(h.Owner, session.Id, bytes); Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(bytes.Length, (await Usage(h.Owner)).UsedBytes); Assert.Equal(0, (await Usage(h.Owner)).ReservedBytes);
        await using (var db = postgres.CreateContext()) Assert.Empty(await db.LibraryItems.ToArrayAsync(Ct));
        await h.Recover(postgres); Assert.Single(h.Store.Objects);
        h.Clock.Advance(TimeSpan.FromMinutes(11)); await h.Recover(postgres);
        Assert.Empty(h.Store.Objects); Assert.Equal(0, (await Usage(h.Owner)).UsedBytes);
    }
    [Fact]
    public async Task Active_scan_is_fenced_from_expiry_recovery_and_cancellation_prevents_publication()
    {
        await using var h = await Harness.Create(postgres); var bytes = Encoding.UTF8.GetBytes("private file");
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        h.Scanner!.Wait = async ct => { entered.TrySetResult(); await release.Task.WaitAsync(ct); };
        var session = await Create(h.Owner, Input(bytes, "file.txt")); var transferring = Transfer(h.Owner, session.Id, bytes);
        await entered.Task.WaitAsync(Ct); h.Clock.Advance(TimeSpan.FromMinutes(5)); await h.Recover(postgres);
        Assert.Equal("receiving", (await h.Owner.GetFromJsonAsync<LibraryUploadSessionDto>($"/api/library/uploads/{session.Id}", Ct))!.State);
        using var duplicate = await Transfer(h.Owner, session.Id, bytes); Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        using var cancelled = await h.Owner.DeleteAsync($"/api/library/uploads/{session.Id}", Ct); Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        release.TrySetResult(); using var response = await transferring; Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Empty(h.Store!.Objects); Assert.Equal(0, (await Usage(h.Owner)).ReservedBytes);
        Assert.Equal("cancelled", (await h.Owner.GetFromJsonAsync<LibraryUploadSessionDto>($"/api/library/uploads/{session.Id}", Ct))!.State);
    }
    [Fact]
    public async Task Crashed_receiving_attempt_is_recovered_conservatively_without_creating_metadata()
    {
        await using var h = await Harness.Create(postgres); var bytes = Encoding.UTF8.GetBytes("partial");
        var session = await Create(h.Owner, Input(bytes, "file.txt")); var attempt = Guid.NewGuid();
        await using (var db = postgres.CreateContext())
        {
            var row = await db.StorageReservations.SingleAsync(Ct); row.State = LibraryUploadState.Receiving;
            row.AttemptId = attempt; row.LeaseToken = Guid.NewGuid(); row.LeaseExpiresAt = h.Clock.GetUtcNow().AddMinutes(1);
            await db.SaveChangesAsync(Ct);
        }
        h.Store!.Objects[LibraryFileTransfers.OriginalKey(attempt)] = bytes;
        h.Clock.Advance(TimeSpan.FromMinutes(2)); await h.Recover(postgres); Assert.Single(h.Store.Objects);
        Assert.Equal(bytes.Length, (await Usage(h.Owner)).UsedBytes);
        h.Clock.Advance(TimeSpan.FromMinutes(11)); await h.Recover(postgres); Assert.Empty(h.Store.Objects);
        Assert.Equal(0, (await Usage(h.Owner)).UsedBytes);
    }
    [Fact]
    public async Task Corrupt_stored_object_is_withheld_even_after_a_clean_upload()
    {
        await using var h = await Harness.Create(postgres); var bytes = Encoding.UTF8.GetBytes("private file");
        var session = await Create(h.Owner, Input(bytes, "file.txt")); using var sent = await Transfer(h.Owner, session.Id, bytes);
        var complete = (await sent.Content.ReadFromJsonAsync<LibraryUploadSessionDto>(Ct))!;
        h.Store!.Objects[h.Store.Objects.Keys.Single()] = Encoding.UTF8.GetBytes("changed file");
        using var download = await h.Owner.GetAsync($"/api/library/items/{complete.ItemId}/content", Ct);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, download.StatusCode);
    }
    [Theory]
    [InlineData("docx")]
    [InlineData("xlsx")]
    [InlineData("pdf")]
    public async Task Supported_documents_keep_original_bytes_and_preview_kind(string extension)
    {
        await using var h = await Harness.Create(postgres);
        var bytes = extension == "pdf" ? Pdf() : Office(extension);
        var type = extension switch { "pdf" => "application/pdf", "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document", _ => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
        var session = await Create(h.Owner, Input(bytes, "document." + extension, type: type));
        using var response = await Transfer(h.Owner, session.Id, bytes); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var complete = (await response.Content.ReadFromJsonAsync<LibraryUploadSessionDto>(Ct))!;
        using var download = await h.Owner.GetAsync($"/api/library/items/{complete.ItemId}/content", Ct);
        Assert.Equal(bytes, await download.Content.ReadAsByteArrayAsync(Ct));
        var detail = await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{complete.ItemId}", Ct);
        Assert.Equal(extension == "pdf" ? "pdf" : "unavailable", detail.GetProperty("previewKind").GetString());
    }
    [Theory]
    [InlineData("../escape.xml")]
    [InlineData("word/vbaProject.bin")]
    [InlineData("word/embeddings/object.bin")]
    [InlineData("word/custom.bin")]
    public async Task Unsafe_office_packages_are_not_published(string entry)
    {
        await using var h = await Harness.Create(postgres); var bytes = Office("docx", entry);
        var session = await Create(h.Owner, Input(bytes, "document.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
        using var response = await Transfer(h.Owner, session.Id, bytes); Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        Assert.Empty(h.Store!.Objects); await using var db = postgres.CreateContext(); Assert.Empty(await db.LibraryItems.ToArrayAsync(Ct));
    }
    private static byte[] Office(string extension, string? extraEntry = null)
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, true))
        {
            void Entry(string path, string text) { using var stream = archive.CreateEntry(path).Open(); stream.Write(Encoding.UTF8.GetBytes(text)); }
            var main = extension == "docx" ? "word/document.xml" : "xl/workbook.xml";
            var type = extension == "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
            var hiddenMacro = extraEntry == "word/custom.bin" ? "<Override PartName=\"/word/custom.bin\" ContentType=\"application/vnd.ms-office.vbaProject\" />" : "";
            Entry("[Content_Types].xml", $"<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Override PartName=\"/{main}\" ContentType=\"{type}\" />{hiddenMacro}</Types>");
            Entry("_rels/.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\" />");
            Entry(main, extension == "docx" ? "<document xmlns=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><body /></document>" :
                "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheets /></workbook>");
            if (extraEntry is not null) Entry(extraEntry, "unsafe");
        }
        return output.ToArray();
    }
    private static byte[] Pdf()
    {
        var content = new StringBuilder("%PDF-1.7\n"); var offsets = new List<int>();
        foreach (var definition in new[] { "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>" })
        { offsets.Add(content.Length); content.Append($"{offsets.Count} 0 obj\n{definition}\nendobj\n"); }
        var xref = content.Length; content.Append("xref\n0 4\n0000000000 65535 f \n");
        foreach (var offset in offsets) content.Append($"{offset:D10} 00000 n \n");
        content.Append($"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(content.ToString());
    }
    [Fact]
    public async Task Lowered_ceiling_releases_an_untouched_upload_without_scanning_or_writing()
    {
        await using var h = await Harness.Create(postgres); var bytes = Encoding.UTF8.GetBytes("const value = 1;");
        var session = await Create(h.Owner, Input(bytes, "value.ts"));
        await using (var db = postgres.CreateContext())
        {
            var entitlement = await db.StorageEntitlements.SingleAsync(Ct);
            db.Add(new LibraryBlobWork { UserId = entitlement.UserId, ObjectKey = "library/available/" + Guid.NewGuid().ToString("N"),
                Purpose = LibraryBlobWorkPurpose.Delete, ChargedBytes = 1_000_000_000,
                CreatedAt = h.Clock.GetUtcNow(), DueAt = h.Clock.GetUtcNow().AddHours(1) });
            await db.SaveChangesAsync(Ct);
        }
        using var transfer = await Transfer(h.Owner, session.Id, bytes);
        Assert.Equal(HttpStatusCode.Conflict, transfer.StatusCode);
        Assert.Equal(LibraryErrors.QuotaExceeded, (await transfer.Content.ReadFromJsonAsync<LibraryErrorDto>(Ct))!.Code);
        var failed = (await h.Owner.GetFromJsonAsync<LibraryUploadSessionDto>($"/api/library/uploads/{session.Id}", Ct))!;
        Assert.Equal("failed", failed.State); Assert.Equal(0, failed.ReservedBytes);
        Assert.Equal(0, h.Scanner!.Calls); Assert.Empty(h.Store!.Objects);
        await using var check = postgres.CreateContext(); Assert.Empty(await check.LibraryItems.ToArrayAsync(Ct));
    }

    public static bool RealStorageEnabled => Environment.GetEnvironmentVariable("WUKNA_LIBRARY_STORAGE_TEST_ENV") is not null;
    [Fact(Skip = "Opt-in disposable SeaweedFS and ClamAV test", SkipUnless = nameof(RealStorageEnabled))]
    public async Task Real_seaweedfs_and_clamav_upload_restart_private_download_malware_rejection_and_purge()
    {
        await using var h = await Harness.Create(postgres, real: true);
        var bytes = Encoding.UTF8.GetBytes("const durable = 'SeaweedFS';\n"); var session = await Create(h.Owner, Input(bytes, "durable.ts"));
        using var uploaded = await Transfer(h.Owner, session.Id, bytes);
        Assert.True(uploaded.IsSuccessStatusCode, $"Upload status {uploaded.StatusCode}: {await uploaded.Content.ReadAsStringAsync(Ct)}"); var complete = (await uploaded.Content.ReadFromJsonAsync<LibraryUploadSessionDto>(Ct))!;
        using var direct = new HttpClient(); var environment = ReadEnvironment();
        using var anonymous = await direct.GetAsync(environment["LIBRARY_TEST_ENDPOINT"] + "/wukna-library/" + "library/available/" + Guid.NewGuid().ToString("N"), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, anonymous.StatusCode);
        var start = new System.Diagnostics.ProcessStartInfo("docker") { RedirectStandardOutput = true, RedirectStandardError = true };
        start.ArgumentList.Add("restart"); start.ArgumentList.Add("wukna-library-phase5-seaweed");
        using var restart = System.Diagnostics.Process.Start(start)!; await restart.WaitForExitAsync(Ct); Assert.Equal(0, restart.ExitCode);
        // Restart closes old sockets; bounded readiness polling is part of this opt-in test.
        var readiness = System.Diagnostics.Stopwatch.StartNew();
        for (var index = 0; index < 60 && readiness.Elapsed < TimeSpan.FromSeconds(90); index++)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(Ct); timeout.CancelAfter(TimeSpan.FromSeconds(5));
            try
            {
                await using var db = postgres.CreateContext(); var asset = await db.LibraryAssets.SingleAsync(Ct);
                var probe = await h.Factory.Services.GetRequiredService<ILibraryFileStorage>().Read(asset.OriginalStorageKey!, bytes.Length, timeout.Token);
                Assert.Equal(bytes, probe); break;
            }
            catch (Exception error) when (!Ct.IsCancellationRequested && error is not Xunit.Sdk.XunitException) { }
            await Task.Delay(1000, Ct);
        }
        using var downloaded = await h.Owner.GetAsync($"/api/library/items/{complete.ItemId}/content", Ct);
        Assert.Equal(HttpStatusCode.OK, downloaded.StatusCode); Assert.Equal(bytes, await downloaded.Content.ReadAsByteArrayAsync(Ct));
        var eicar = Encoding.ASCII.GetBytes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
        var rejected = await Create(h.Owner, Input(eicar, "security-test.txt"));
        using var malware = await Transfer(h.Owner, rejected.Id, eicar); Assert.Equal(HttpStatusCode.UnprocessableEntity, malware.StatusCode);
        var derivativeScanner = new LibraryClamScanner(Options.Create(new LibraryStorageOptions { ClamHost = "127.0.0.1", ClamPort = 13311 }),
            Options.Create(new LibraryOptions { MaxFileBytes = 100 }));
        using var derivative = new MemoryStream(new byte[200]);
        Assert.True(await derivativeScanner.IsClean(derivative, Ct));
        using var trash = await Lifecycle(h.Owner, "trash", complete.ItemId!.Value);
        using var purge = await Lifecycle(h.Owner, "purge", complete.ItemId.Value); Assert.Equal(HttpStatusCode.NoContent, purge.StatusCode);
        await h.Recover(postgres); Assert.Equal(0, (await Usage(h.Owner)).UsedBytes);
    }
    private static Dictionary<string, string> ReadEnvironment() => File.ReadAllLines(Environment.GetEnvironmentVariable("WUKNA_LIBRARY_STORAGE_TEST_ENV")!)
        .Where(l => l.Contains('=')).Select(l => l.Split('=', 2)).ToDictionary(p => p[0], p => p[1]);
    private static LibraryUploadCreateRequest Input(byte[] bytes, string name, string category = "document", string type = "text/plain") =>
        new(Guid.NewGuid(), category, name, type, bytes.Length, Convert.ToHexStringLower(SHA256.HashData(bytes)), null);
    private static async Task<LibraryUploadSessionDto> Create(HttpClient client, LibraryUploadCreateRequest input)
    { using var response = await client.PostAsJsonAsync("/api/library/uploads", input, Ct); Assert.Equal(HttpStatusCode.Created, response.StatusCode); return (await response.Content.ReadFromJsonAsync<LibraryUploadSessionDto>(Ct))!; }
    private static Task<HttpResponseMessage> Transfer(HttpClient client, Guid id, byte[] bytes)
    { var body = new ByteArrayContent(bytes); body.Headers.ContentType = new("application/octet-stream"); return client.PutAsync($"/api/library/uploads/{id}/content", body, Ct); }
    private static Task<HttpResponseMessage> Lifecycle(HttpClient client, string action, Guid id) => client.PostAsJsonAsync($"/api/library/items/{action}", new { ids = new[] { id } }, Ct);
    private static async Task<LibraryStorageSummaryDto> Usage(HttpClient client) => (await client.GetFromJsonAsync<LibraryStorageSummaryDto>("/api/library/storage", Ct))!;
    private sealed class UnknownLengthContent : HttpContent
    {
        private readonly byte[] bytes;
        public UnknownLengthContent(byte[] bytes) { this.bytes = bytes; Headers.ContentType = new("application/octet-stream"); }
        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) => stream.WriteAsync(bytes).AsTask();
        protected override bool TryComputeLength(out long length) { length = 0; return false; }
    }
    private sealed class MemoryStore : ILibraryFileStorage
    {
        public ConcurrentDictionary<string, byte[]> Objects { get; } = new();
        public bool PutFailsAfterWriting { get; set; } public bool DeleteFails { get; set; } public int Puts;
        public async Task Put(string key, Stream content, string type, CancellationToken ct)
        { using var output = new MemoryStream(); await content.CopyToAsync(output, ct); Objects[key] = output.ToArray(); Interlocked.Increment(ref Puts); if (PutFailsAfterWriting) throw new IOException("test outage"); }
        public Task<byte[]> Read(string key, long maximum, CancellationToken ct) => Task.FromResult(Objects[key]);
        public Task<bool> Exists(string key, CancellationToken ct) => Task.FromResult(Objects.ContainsKey(key));
        public Task Delete(string key, CancellationToken ct) { if (DeleteFails) throw new IOException("test outage"); Objects.TryRemove(key, out _); return Task.CompletedTask; }
    }
    private sealed class Scanner : ILibraryScanner
    {
        public bool Clean = true; public bool Unavailable; public int Calls; public Func<CancellationToken, Task>? Wait;
        public async Task<bool> IsClean(Stream content, CancellationToken ct)
        { Calls++; if (Wait is not null) await Wait(ct); if (Unavailable) throw new IOException("scanner unavailable"); return Clean; }
    }
    private sealed class Factory(PostgresFixture postgres, ManualTimeProvider clock, string directory, MemoryStore? store, Scanner? scanner) : WuknaWebApplicationFactory(postgres, clock)
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("Library:Storage:Enabled", "true"); builder.UseSetting("Library:Storage:WorkerEnabled", "false");
            builder.UseSetting("Library:Storage:QuarantineDirectory", directory);
            builder.UseSetting("Library:Storage:AccessKey", "controlled-test-key"); builder.UseSetting("Library:Storage:SecretKey", new string('x', 64));
            if (store is null)
            {
                var environment = ReadEnvironment(); builder.UseSetting("Library:Storage:Endpoint", environment["LIBRARY_TEST_ENDPOINT"]);
                builder.UseSetting("Library:Storage:AccessKey", environment["LIBRARY_S3_ACCESS_KEY"]);
                builder.UseSetting("Library:Storage:SecretKey", environment["LIBRARY_S3_SECRET_KEY"]);
                builder.UseSetting("Library:Storage:ClamHost", "127.0.0.1"); builder.UseSetting("Library:Storage:ClamPort", "13311");
            }
            else builder.ConfigureServices(services => { services.RemoveAll<ILibraryFileStorage>(); services.AddSingleton<ILibraryFileStorage>(store); services.RemoveAll<ILibraryScanner>(); services.AddSingleton<ILibraryScanner>(scanner!); });
        }
    }
    private sealed class Harness : IAsyncDisposable
    {
        public required Factory Factory; public required HttpClient Owner; public required HttpClient Other;
        public required ManualTimeProvider Clock; public required string Directory; public MemoryStore? Store; public Scanner? Scanner;
        public static async Task<Harness> Create(PostgresFixture postgres, bool real = false)
        {
            await postgres.ResetAsync(Ct); var a = new User(); var b = new User();
            await using (var db = postgres.CreateContext()) { db.AddRange(a, b); await db.SaveChangesAsync(Ct); }
            var clock = new ManualTimeProvider(DateTimeOffset.UtcNow); var store = real ? null : new MemoryStore(); var scanner = real ? null : new Scanner();
            var directory = Path.Combine(Path.GetTempPath(), "wukna-library-test-" + Guid.NewGuid().ToString("N"));
            var factory = new Factory(postgres, clock, directory, store, scanner);
            HttpClient Client(User user)
            {
                var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", new JwtTokenGenerator(new JwtOptions {
                    Issuer = WuknaWebApplicationFactory.JwtIssuer, Audience = WuknaWebApplicationFactory.JwtAudience, SigningKey = WuknaWebApplicationFactory.JwtSigningKey,
                    AccessTokenMinutes = 120, RefreshTokenDays = 7 }, clock).CreateAccessToken(user).Token); return client;
            }
            return new() { Factory = factory, Owner = Client(a), Other = Client(b), Clock = clock, Directory = directory, Store = store, Scanner = scanner };
        }
        public async Task Recover(PostgresFixture postgres)
        {
            await using var db = postgres.CreateContext(); await LibraryStorageWorker.RunBatch(db,
                Factory.Services.GetRequiredService<ILibraryFileStorage>(), Factory.Services.GetRequiredService<IOptions<LibraryOptions>>(), Clock, Ct);
        }
        public async ValueTask DisposeAsync()
        { Owner.Dispose(); Other.Dispose(); await Factory.DisposeAsync(); if (System.IO.Directory.Exists(Directory)) System.IO.Directory.Delete(Directory, true); }
    }
}
