namespace Wukna.IntegrationTests;

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Wukna.Features.Auth;
using Wukna.Features.Library;
using Wukna.Features.Users;
using Xunit;

public sealed class LibraryEndpointTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task All_routes_require_authentication_and_foreign_resources_are_indistinguishable_from_missing()
    {
        await using var h = await Harness.Create(postgres);
        var item = await Video(h.Owner, "https://example.test/video");
        var folder = await Folder(h.Owner, "video");
        var collection = await Collection(h.Owner);
        var upload = await Upload(h.Owner);
        var calls = new (HttpMethod Method, string Path, object? Body)[] {
            (HttpMethod.Get, "/capabilities", null), (HttpMethod.Get, "/summary", null), (HttpMethod.Get, "/storage", null),
            (HttpMethod.Get, "/items", null), (HttpMethod.Get, "/folders", null), (HttpMethod.Get, "/collections", null),
            (HttpMethod.Get, $"/items/{item}", null), (HttpMethod.Get, $"/items/{item}/content", null), (HttpMethod.Get, $"/items/{item}/thumbnail", null),
            (HttpMethod.Get, $"/folders/{folder.Id}", null), (HttpMethod.Delete, $"/folders/{folder.Id}", null),
            (HttpMethod.Get, $"/collections/{collection.Id}", null),
            (HttpMethod.Get, $"/items?folderId={folder.Id}", null), (HttpMethod.Get, $"/folders?parentId={folder.Id}", null),
            (HttpMethod.Get, $"/items?collectionId={collection.Id}", null),
            (HttpMethod.Patch, $"/items/{item}", new { favorite = true }),
            (HttpMethod.Post, "/items/bulk-update", new { ids = new[] { item }, update = new { favorite = true } }),
            (HttpMethod.Post, "/items/trash", new { ids = new[] { item } }), (HttpMethod.Post, "/items/restore", new { ids = new[] { item } }),
            (HttpMethod.Post, "/items/purge", new { ids = new[] { item } }),
            (HttpMethod.Put, $"/collections/{collection.Id}", new { name = "Changed", description = (string?)null }),
            (HttpMethod.Delete, $"/collections/{collection.Id}", null),
            (HttpMethod.Post, $"/collections/{collection.Id}/items/add", new { itemIds = new[] { item } }),
            (HttpMethod.Post, $"/collections/{collection.Id}/items/remove", new { itemIds = new[] { item } }),
            (HttpMethod.Get, $"/uploads/{upload.Id}", null), (HttpMethod.Delete, $"/uploads/{upload.Id}", null),
            (HttpMethod.Put, $"/uploads/{upload.Id}/content", null),
            (HttpMethod.Post, $"/uploads/{upload.Id}/finalize", new { clientUploadId = Guid.NewGuid(), checksum = new string('a', 64) }),
            (HttpMethod.Post, "/folders", new { name = "Child", category = "video", parentId = folder.Id }),
            (HttpMethod.Post, "/collections", new { name = "New", description = (string?)null }),
            (HttpMethod.Post, "/videos", new { name = "New", description = (string?)null, folderId = folder.Id, url = "https://example.test/new" }),
            (HttpMethod.Post, "/uploads", new { clientUploadId = Guid.NewGuid(), category = "document", fileName = "file.txt", contentType = "text/plain", sizeBytes = 16, checksum = new string('a', 64), folderId = Guid.NewGuid() })
        };
        foreach (var (method, path, body) in calls)
        {
            using var anonymous = await Send(h.Anonymous, method, path, body);
            Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
            Assert.Equal("no-store", anonymous.Headers.CacheControl?.ToString());
            if (path is "/capabilities" or "/summary" or "/storage" or "/items" or "/folders" or "/collections") continue;
            if (path == "/collections" && method == HttpMethod.Post) continue;
            using var stolen = await Send(h.Other, method, path, body);
            Assert.Equal(HttpStatusCode.NotFound, stolen.StatusCode);
            Assert.Equal(LibraryErrors.NotFound, (await stolen.Content.ReadFromJsonAsync<LibraryErrorDto>(Ct))!.Code);
        }
        Assert.Empty((await h.Other.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items", Ct))!.Items);
        using var missingSubject = Client(h.Factory, new User(), h.Clock);
        using var absent = await missingSubject.GetAsync("/api/library/storage", Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, absent.StatusCode);
        await using var db = postgres.CreateContext(); Assert.False((await db.LibraryItems.SingleAsync(Ct)).Favorite);
    }

    [Fact]
    public async Task Videos_normalize_persist_metadata_and_reload_with_private_summary_and_detail_contracts()
    {
        await using var h = await Harness.Create(postgres);
        var youtube = await Video(h.Owner, "https://youtu.be/dQw4w9WgXcQ?t=10");
        var vimeo = await Video(h.Owner, "https://player.vimeo.com/video/123456");
        var external = await Video(h.Owner, "https://example.test/movie?x=1");
        var detail = await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{youtube}", Ct);
        Assert.Equal("https://www.youtube.com/watch?v=dQw4w9WgXcQ", detail.GetProperty("url").GetString());
        Assert.Equal("Creator", detail.GetProperty("creator").GetString()); Assert.Equal("Provider title", detail.GetProperty("metadataTitle").GetString());
        Assert.StartsWith("/api/library/items/", detail.GetProperty("thumbnailReference").GetString());
        Assert.DoesNotContain("thumbnailUrl", detail.GetRawText()); Assert.DoesNotContain("userId", detail.GetRawText());
        using var duplicate = await Send(h.Owner, HttpMethod.Post, "/videos", new { name = "Duplicate", url = "https://www.youtube.com/shorts/dQw4w9WgXcQ", folderId = (Guid?)null });
        await Error(duplicate, 409, LibraryErrors.VideoDuplicate);
        Assert.Equal(2, h.Provider.Requests.Count);
        var page = (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items?category=video", Ct))!;
        Assert.Equal(3, page.Items.Count); Assert.All(page.Items, item => Assert.Equal(0, item.SizeBytes));
        Assert.Equal(0, (await h.Owner.GetFromJsonAsync<LibraryStorageSummaryDto>("/api/library/storage", Ct))!.UsedBytes);
        using var reloadedFactory = new LibraryFactory(postgres, h.Clock);
        using var reloaded = Client(reloadedFactory, h.A, h.Clock);
        Assert.Equal("vimeo", (await reloaded.GetFromJsonAsync<JsonElement>($"/api/library/items/{vimeo}", Ct)).GetProperty("provider").GetString());
        Assert.Equal("external", (await reloaded.GetFromJsonAsync<JsonElement>($"/api/library/items/{external}", Ct)).GetProperty("provider").GetString());
    }

    [Theory]
    [InlineData("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube")]
    [InlineData("https://m.youtube.com/embed/dQw4w9WgXcQ", "youtube")]
    [InlineData("https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube")]
    [InlineData("https://vimeo.com/123456", "vimeo")]
    [InlineData("https://example.test/video", "external")]
    public void Video_url_normalization_matches_supported_frontend_providers(string url, string provider) =>
        Assert.Equal(provider, LibraryAccess.Wire(LibraryVideoCommands.Normalize(url).Provider));

    [Theory]
    [InlineData("http://example.test/video")]
    [InlineData("https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ")]
    [InlineData("https://youtube.com/watch?v=bad")]
    [InlineData("https://youtube.com/watch?v=dQw4w9WgXcQ&v=dQw4w9WgXcQ")]
    [InlineData("https://youtube.com/playlist?list=123")]
    [InlineData("https://vimeo.com/channels/example")]
    [InlineData("https://youtube.com:8443/watch?v=dQw4w9WgXcQ")]
    public void Video_normalization_rejects_invalid_and_credential_urls(string url) => Assert.Throws<LibraryFailure>(() => LibraryVideoCommands.Normalize(url));

    [Fact]
    public async Task Folder_hierarchy_root_queries_uniqueness_and_delete_pins_are_persistent()
    {
        await using var h = await Harness.Create(postgres);
        var root = await Folder(h.Owner, "video", "Root"); var child = await Folder(h.Owner, "video", "Child", root.Id);
        var video = await Video(h.Owner, "https://example.test/nested", child.Id);
        using var duplicate = await Send(h.Owner, HttpMethod.Post, "/folders", new { name = " root ", category = "video", parentId = (Guid?)null });
        await Error(duplicate, 409, LibraryErrors.FolderNameConflict);
        var roots = (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryFolderDto>>("/api/library/folders?parentId=root", Ct))!.Items;
        Assert.Single(roots); Assert.Equal(root.Id, roots[0].Id);
        Assert.Equal(2, (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryFolderDto>>("/api/library/folders", Ct))!.Items.Count);
        Assert.Single((await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>($"/api/library/items?folderId={child.Id}", Ct))!.Items);
        Assert.Empty((await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items?folderId=root", Ct))!.Items);
        var detail = await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{video}", Ct);
        Assert.Equal(new[] { root.Id, child.Id }, detail.GetProperty("folderBreadcrumb").EnumerateArray().Select(row => row.GetProperty("id").GetGuid()));
        using var pinned = await h.Owner.DeleteAsync($"/api/library/folders/{root.Id}", Ct); await Error(pinned, 409, LibraryErrors.FolderNotEmpty);
        using var wrongCategory = await Send(h.Owner, HttpMethod.Post, "/folders", new { name = "Wrong", category = "document", parentId = root.Id }); await Error(wrongCategory, 400, LibraryErrors.InvalidFolder);
        await Action(h.Owner, "trash", video);
        using var trashPin = await h.Owner.DeleteAsync($"/api/library/folders/{child.Id}", Ct); await Error(trashPin, 409, LibraryErrors.FolderNotEmpty);
        await Action(h.Owner, "purge", video);
        using var deleteChild = await h.Owner.DeleteAsync($"/api/library/folders/{child.Id}", Ct); Assert.Equal(HttpStatusCode.NoContent, deleteChild.StatusCode);
        using var deleteRoot = await h.Owner.DeleteAsync($"/api/library/folders/{root.Id}", Ct); Assert.Equal(HttpStatusCode.NoContent, deleteRoot.StatusCode);
        var docs = await Folder(h.Owner, "document"); await Upload(h.Owner, docs.Id);
        using var reservationPin = await h.Owner.DeleteAsync($"/api/library/folders/{docs.Id}", Ct); await Error(reservationPin, 409, LibraryErrors.FolderNotEmpty);
    }

    [Fact]
    public async Task Collection_membership_counts_favorites_patch_and_trash_restore_are_atomic()
    {
        await using var h = await Harness.Create(postgres);
        var a = await Video(h.Owner, "https://example.test/a"); var b = await Video(h.Owner, "https://example.test/b"); var foreign = await Video(h.Other, "https://example.test/other");
        var collection = await Collection(h.Owner);
        using var badAdd = await Send(h.Owner, HttpMethod.Post, $"/collections/{collection.Id}/items/add", new { itemIds = new[] { a, foreign } }); await Error(badAdd, 404, LibraryErrors.NotFound);
        Assert.Equal(0, (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryCollectionDto>>("/api/library/collections", Ct))!.Items.Single().ItemCount);
        for (var repeat = 0; repeat < 2; repeat++) { using var add = await Send(h.Owner, HttpMethod.Post, $"/collections/{collection.Id}/items/add", new { itemIds = new[] { a, a, b } }); Assert.Equal(HttpStatusCode.NoContent, add.StatusCode); }
        using var edit = await Send(h.Owner, HttpMethod.Post, "/items/bulk-update", new { ids = new[] { a, b }, update = new { favorite = true, tags = new[] { "Study", "study" }, notes = "Keep this" } }); Assert.Equal(HttpStatusCode.NoContent, edit.StatusCode);
        using var invalid = await Send(h.Owner, HttpMethod.Post, "/items/bulk-update", new { ids = new[] { a, foreign }, update = new { favorite = false } }); await Error(invalid, 404, LibraryErrors.NotFound);
        Assert.Equal(2, (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items?favorite=true&tag=study", Ct))!.Items.Count);
        using var patch = await Send(h.Owner, HttpMethod.Patch, $"/items/{a}", new { name = "Renamed", description = "Description" }); Assert.Equal(HttpStatusCode.NoContent, patch.StatusCode);
        using var clear = await Send(h.Owner, HttpMethod.Patch, $"/items/{a}", new { description = (string?)null, favorite = false, tags = Array.Empty<string>(), notes = "" }); Assert.Equal(HttpStatusCode.NoContent, clear.StatusCode);
        var detail = await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{a}", Ct);
        Assert.Equal("Renamed", detail.GetProperty("name").GetString()); Assert.Equal(JsonValueKind.Null, detail.GetProperty("description").ValueKind); Assert.False(detail.GetProperty("favorite").GetBoolean());
        await Action(h.Owner, "trash", a);
        Assert.Equal(1, (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryCollectionDto>>("/api/library/collections", Ct))!.Items.Single().ItemCount);
        using var trashedPatch = await Send(h.Owner, HttpMethod.Patch, $"/items/{a}", new { favorite = true }); await Error(trashedPatch, 409, LibraryErrors.ItemTrashed);
        await Action(h.Owner, "restore", a);
        Assert.Equal(2, (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>($"/api/library/items?collectionId={collection.Id}", Ct))!.Items.Count);
        using var renameCollection = await Send(h.Owner, HttpMethod.Put, $"/collections/{collection.Id}", new { name = "Renamed collection", description = "Saved description" }); Assert.Equal(HttpStatusCode.NoContent, renameCollection.StatusCode);
        using var delete = await h.Owner.DeleteAsync($"/api/library/collections/{collection.Id}", Ct); Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        Assert.Equal(2, (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items", Ct))!.Items.Count);
    }

    [Fact]
    public async Task Video_save_and_restore_conflicts_are_serialized_across_api_instances()
    {
        await using var h = await Harness.Create(postgres);
        await using var secondFactory = new LibraryFactory(postgres, h.Clock); using var second = Client(secondFactory, h.A, h.Clock);
        var attempts = await Task.WhenAll(Enumerable.Range(0, 8).Select(index => Send(index % 2 == 0 ? h.Owner : second, HttpMethod.Post, "/videos", new { name = "Same", url = "https://example.test/same" })));
        Assert.Single(attempts, response => response.StatusCode == HttpStatusCode.Created); Assert.Equal(7, attempts.Count(response => response.StatusCode == HttpStatusCode.Conflict));
        foreach (var response in attempts) response.Dispose();
        var first = (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items", Ct))!.Items.Single().Id;
        await Action(h.Owner, "trash", first); var replacement = await Video(h.Owner, "https://example.test/same"); var unrelated = await Video(h.Owner, "https://example.test/unrelated"); await Action(h.Owner, "trash", unrelated);
        using var conflict = await Send(h.Owner, HttpMethod.Post, "/items/restore", new { ids = new[] { first, unrelated } }); await Error(conflict, 409, LibraryErrors.VideoDuplicate);
        Assert.Equal(2, (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items?trash=true", Ct))!.Items.Count);
        await Action(h.Owner, "trash", replacement); await Action(h.Owner, "restore", first);
    }

    [Theory]
    [InlineData("created-desc")]
    [InlineData("updated-desc")]
    [InlineData("name-asc")]
    [InlineData("size-desc")]
    public async Task Keyset_pagination_handles_ties_and_cursor_owner_filter_sort_tampering_and_expiry(string sort)
    {
        await using var h = await Harness.Create(postgres);
        await using (var db = postgres.CreateContext())
        {
            for (var i = 0; i < 36; i++)
            {
                var item = new LibraryItem { UserId = h.A.Id, Category = LibraryCategory.Document, Name = $"File {i % 4}", CreatedAt = h.Clock.GetUtcNow(), UpdatedAt = h.Clock.GetUtcNow() };
                db.Add(item); db.Add(new LibraryAsset { ItemId = item.Id, UserId = h.A.Id, Category = LibraryCategory.Document, OriginalFileName = "file.txt", SizeBytes = i % 3, StoredBytes = i % 3, CreatedAt = h.Clock.GetUtcNow(), UpdatedAt = h.Clock.GetUtcNow() });
            }
            await db.SaveChangesAsync(Ct);
        }
        var path = $"/api/library/items?sort={sort}&limit=7"; var first = (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>(path, Ct))!;
        Assert.NotNull(first.NextCursor); var seen = first.Items.Select(row => row.Id).ToList(); var cursor = first.NextCursor;
        while (cursor is not null)
        {
            var page = (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>(path + "&cursor=" + Uri.EscapeDataString(cursor), Ct))!;
            Assert.InRange(page.Items.Count, 1, 7); seen.AddRange(page.Items.Select(row => row.Id)); cursor = page.NextCursor;
        }
        Assert.Equal(36, seen.Count); Assert.Equal(36, seen.Distinct().Count());
        var encoded = Uri.EscapeDataString(first.NextCursor!);
        foreach (var (client, bad) in new[] { (h.Other, path + "&cursor=" + encoded), (h.Owner, path + "&favorite=true&cursor=" + encoded),
            (h.Owner, "/api/library/items?sort=" + (sort == "name-asc" ? "created-desc" : "name-asc") + "&cursor=" + encoded),
            (h.Owner, path + "&cursor=" + Uri.EscapeDataString("!" + first.NextCursor![1..])) })
        { using var rejected = await client.GetAsync(bad, Ct); await Error(rejected, 400, LibraryErrors.InvalidCursor); }
        h.Clock.Advance(TimeSpan.FromHours(1)); using var expired = await h.Owner.GetAsync(path + "&cursor=" + encoded, Ct); await Error(expired, 400, LibraryErrors.InvalidCursor);
    }

    [Fact]
    public async Task Available_document_source_is_searchable_but_processing_source_and_storage_keys_are_withheld()
    {
        await using var h = await Harness.Create(postgres);
        var available = await SeedDocument(h, "publicNeedle", true); var pending = await SeedDocument(h, "privateNeedle", false);
        Assert.Single((await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items?search=PUBLICneedle&documentKind=code", Ct))!.Items);
        Assert.Single((await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items?search=typescript", Ct))!.Items);
        Assert.Empty((await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items?search=privateNeedle", Ct))!.Items);
        var detail = await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{available}", Ct); Assert.Equal("publicNeedle", detail.GetProperty("source").GetString());
        var waiting = await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{pending}", Ct); Assert.False(waiting.TryGetProperty("source", out _)); Assert.Equal("unavailable", waiting.GetProperty("previewKind").GetString());
        Assert.DoesNotContain("storageKey", detail.GetRawText(), StringComparison.OrdinalIgnoreCase);
        using var content = await h.Owner.GetAsync($"/api/library/items/{available}/content", Ct); await Error(content, 503, LibraryErrors.StorageUnavailable);
        using var thumbnail = await h.Owner.GetAsync($"/api/library/items/{available}/thumbnail", Ct); await Error(thumbnail, 503, LibraryErrors.StorageUnavailable);
        using var literal = await Send(h.Owner, HttpMethod.Patch, $"/items/{available}", new { name = "Literal %_" }); Assert.Equal(HttpStatusCode.NoContent, literal.StatusCode);
        Assert.Single((await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items?search=%25_", Ct))!.Items);
    }

    [Fact]
    public async Task Permanent_purge_keeps_charge_in_durable_cleanup_and_completed_upload_tombstone()
    {
        await using var h = await Harness.Create(postgres); var item = await SeedDocument(h, "source", true);
        await using (var db = postgres.CreateContext())
        {
            db.Add(Completed(h, item)); await db.SaveChangesAsync(Ct);
        }
        await Action(h.Owner, "trash", item);
        Assert.Equal(16, (await h.Owner.GetFromJsonAsync<LibraryStorageSummaryDto>("/api/library/storage", Ct))!.UsedBytes);
        await Action(h.Owner, "purge", item);
        Assert.Equal(16, (await h.Owner.GetFromJsonAsync<LibraryStorageSummaryDto>("/api/library/storage", Ct))!.UsedBytes);
        using var gone = await h.Owner.GetAsync($"/api/library/items/{item}", Ct); await Error(gone, 404, LibraryErrors.NotFound);
        await using var check = postgres.CreateContext(); Assert.Equal(16, (await check.LibraryBlobWork.SingleAsync(Ct)).ChargedBytes);
        var session = await check.StorageReservations.SingleAsync(Ct); Assert.Null(session.ResultItemId); Assert.NotNull(session.ResultPurgedAt);
        var read = (await h.Owner.GetFromJsonAsync<LibraryUploadSessionDto>($"/api/library/uploads/{session.Id}", Ct))!; Assert.True(read.ResultPurged);
    }

    [Fact]
    public async Task Reservation_idempotency_cancellation_expiry_and_finalization_never_create_placeholder_files()
    {
        await using var h = await Harness.Create(postgres); var operation = Guid.NewGuid(); var input = UploadInput(operation);
        var attempts = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Send(h.Owner, HttpMethod.Post, "/uploads", input)));
        var sessions = new List<LibraryUploadSessionDto>(); foreach (var response in attempts) { Assert.True(response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK); sessions.Add((await response.Content.ReadFromJsonAsync<LibraryUploadSessionDto>(Ct))!); response.Dispose(); }
        Assert.Single(sessions.Select(row => row.Id).Distinct()); var session = sessions[0]; Assert.Equal(32, session.ReservedBytes); Assert.Null(session.ItemId);
        using var changed = await Send(h.Owner, HttpMethod.Post, "/uploads", input with { SizeBytes = 17 }); await Error(changed, 409, LibraryErrors.UploadConflict);
        using var binary = await Send(h.Owner, HttpMethod.Put, $"/uploads/{session.Id}/content", null); await Error(binary, 503, LibraryErrors.StorageUnavailable);
        using var finalize = await Send(h.Owner, HttpMethod.Post, $"/uploads/{session.Id}/finalize", new LibraryUploadFinalizeRequest(operation, input.Checksum)); await Error(finalize, 503, LibraryErrors.StorageUnavailable);
        using var wrongIdentity = await Send(h.Owner, HttpMethod.Post, $"/uploads/{session.Id}/finalize", new LibraryUploadFinalizeRequest(Guid.NewGuid(), input.Checksum)); await Error(wrongIdentity, 409, LibraryErrors.UploadConflict);
        using var cancel = await h.Owner.DeleteAsync($"/api/library/uploads/{session.Id}", Ct); Assert.Equal("cancelled", (await cancel.Content.ReadFromJsonAsync<LibraryUploadSessionDto>(Ct))!.State);
        var retry = await Upload(h.Owner); h.Clock.Advance(TimeSpan.FromSeconds(901));
        await using (var db = postgres.CreateContext()) Assert.Equal(1, await LibraryReservationWorker.ExpireBatch(db, Options.Create(new LibraryOptions()), h.Clock, Ct));
        var expired = (await h.Owner.GetFromJsonAsync<LibraryUploadSessionDto>($"/api/library/uploads/{retry.Id}", Ct))!; Assert.Equal("expired", expired.State); Assert.Equal(0, expired.ReservedBytes);
        var capabilities = (await h.Owner.GetFromJsonAsync<LibraryCapabilitiesDto>("/api/library/capabilities", Ct))!; Assert.False(capabilities.StorageAvailable); Assert.False(capabilities.CheckoutEnabled);
        await using var check = postgres.CreateContext(); Assert.Empty(await check.LibraryItems.ToArrayAsync(Ct)); Assert.Empty(await check.LibraryAssets.ToArrayAsync(Ct));
    }

    [Fact]
    public async Task Active_writer_cancellation_and_expiry_retain_lease_and_capacity()
    {
        await using var h = await Harness.Create(postgres); var session = await Upload(h.Owner); var lease = Guid.NewGuid();
        await using (var db = postgres.CreateContext())
        {
            var row = await db.StorageReservations.SingleAsync(Ct); row.State = LibraryUploadState.Receiving; row.AttemptId = Guid.NewGuid(); row.LeaseToken = lease; row.LeaseExpiresAt = h.Clock.GetUtcNow().AddMinutes(20); await db.SaveChangesAsync(Ct);
        }
        h.Clock.Advance(TimeSpan.FromSeconds(901));
        using var cancel = await h.Owner.DeleteAsync($"/api/library/uploads/{session.Id}", Ct); var dto = (await cancel.Content.ReadFromJsonAsync<LibraryUploadSessionDto>(Ct))!;
        Assert.Equal("receiving", dto.State); Assert.True(dto.CancellationRequested); Assert.Equal(32, dto.ReservedBytes);
        await using var check = postgres.CreateContext(); Assert.Equal(lease, (await check.StorageReservations.SingleAsync(Ct)).LeaseToken);
        Assert.Equal(32, (await h.Owner.GetFromJsonAsync<LibraryStorageSummaryDto>("/api/library/storage", Ct))!.ReservedBytes);
    }

    [Fact]
    public async Task Concurrent_reservations_respect_quota_across_instances_including_trash_cleanup_and_terminal_balances()
    {
        await using var h = await Harness.Create(postgres, quota: 1000); var item = await SeedDocument(h, "source", true);
        await using (var db = postgres.CreateContext())
        {
            (await db.LibraryItems.SingleAsync(Ct)).DeletedAt = h.Clock.GetUtcNow(); var asset = await db.LibraryAssets.SingleAsync(Ct); asset.SizeBytes = 180; asset.StoredBytes = 180;
            db.Add(new LibraryBlobWork { UserId = h.A.Id, Purpose = LibraryBlobWorkPurpose.Delete, ObjectKey = "library/quarantine/" + Guid.NewGuid().ToString("N"), ChargedBytes = 220, CreatedAt = h.Clock.GetUtcNow(), DueAt = h.Clock.GetUtcNow() });
            var failed = Completed(h, item); failed.State = LibraryUploadState.Failed; failed.CompletedAt = null; failed.ResultItemId = null; failed.ReservedBytes = 50; db.Add(failed); await db.SaveChangesAsync(Ct);
        }
        await using var secondFactory = new LibraryFactory(postgres, h.Clock, quota: 1000); using var second = Client(secondFactory, h.A, h.Clock);
        var attempts = await Task.WhenAll(Enumerable.Range(0, 12).Select(index => Send(index % 2 == 0 ? h.Owner : second, HttpMethod.Post, "/uploads", UploadInput(Guid.NewGuid()) with { SizeBytes = 100 })));
        Assert.Equal(2, attempts.Count(response => response.StatusCode == HttpStatusCode.Created)); Assert.Equal(10, attempts.Count(response => response.StatusCode == HttpStatusCode.Conflict));
        foreach (var response in attempts) response.Dispose();
        var usage = (await h.Owner.GetFromJsonAsync<LibraryStorageSummaryDto>("/api/library/storage", Ct))!;
        Assert.Equal(400, usage.UsedBytes); Assert.Equal(450, usage.ReservedBytes); Assert.Equal(150, usage.AvailableBytes); Assert.Equal(1000, usage.QuotaBytes);
    }

    [Theory]
    [InlineData("?limit=0")]
    [InlineData("?limit=101")]
    [InlineData("?limit=1&limit=2")]
    [InlineData("?sort=sql")]
    [InlineData("?category=snippet")]
    [InlineData("?folderId=invalid")]
    [InlineData("?favorite=yes")]
    [InlineData("?documentKind=html")]
    [InlineData("?unknown=true")]
    public async Task Invalid_list_queries_return_stable_errors(string query)
    { await using var h = await Harness.Create(postgres); using var response = await h.Owner.GetAsync("/api/library/items" + query, Ct); await Error(response, 400, LibraryErrors.InvalidQuery); }

    [Fact]
    public async Task Invalid_and_immutable_write_fields_are_rejected_without_mutation()
    {
        await using var h = await Harness.Create(postgres); var item = await Video(h.Owner, "https://example.test/item");
        foreach (var patch in new object[] { new { }, new { name = " " }, new { name = new string('a', 161) }, new { favorite = (bool?)null }, new { notes = new string('a', 4001) }, new { tags = new[] { "" } }, new { tags = new[] { new string('a', 41) } } })
        { using var response = await Send(h.Owner, HttpMethod.Patch, $"/items/{item}", patch); await Error(response, 400, LibraryErrors.InvalidItem); }
        foreach (var patch in new object[] { new { userId = h.OtherId }, new { originalStorageKey = "public/file" }, new { category = "document" }, new { processingStatus = "available" } })
        { using var response = await Send(h.Owner, HttpMethod.Patch, $"/items/{item}", patch); Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode); }
        using var oversized = await Send(h.Owner, HttpMethod.Post, "/items/trash", new { ids = Enumerable.Repeat(item, 101).ToArray() }); await Error(oversized, 400, LibraryErrors.InvalidItem);
        var docFolder = await Folder(h.Owner, "document"); using var badMove = await Send(h.Owner, HttpMethod.Patch, $"/items/{item}", new { folderId = docFolder.Id }); await Error(badMove, 400, LibraryErrors.InvalidFolder);
        using var unsupported = await Send(h.Owner, HttpMethod.Post, "/uploads", UploadInput(Guid.NewGuid()) with { FileName = "malware.exe" }); await Error(unsupported, 415, LibraryErrors.FileType);
        using var tooBig = await Send(h.Owner, HttpMethod.Post, "/uploads", UploadInput(Guid.NewGuid()) with { SizeBytes = 256001 }); await Error(tooBig, 413, LibraryErrors.FileTooLarge);
        using var badHash = await Send(h.Owner, HttpMethod.Post, "/uploads", UploadInput(Guid.NewGuid()) with { Checksum = "placeholder" }); await Error(badHash, 400, LibraryErrors.UploadConflict);
        using var body = await Send(h.Owner, HttpMethod.Patch, $"/items/{item}", new { notes = new string('a', 66000) }); await Error(body, 413, LibraryErrors.FileTooLarge);
        Assert.Equal("Saved video", (await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{item}", Ct)).GetProperty("name").GetString());
    }

    [Fact]
    public async Task Provider_failures_unsafe_thumbnails_and_external_hosts_fail_safely()
    {
        await using var h = await Harness.Create(postgres); h.Provider.Response = _ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
        var item = await Video(h.Owner, "https://youtu.be/dQw4w9WgXcQ");
        Assert.Equal("library_video_metadata_unavailable", (await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{item}", Ct)).GetProperty("metadataErrorCode").GetString());
        h.Provider.Response = _ => new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { title = "Safe", author_name = "Author", thumbnail_url = "https://127.0.0.1/private" }) };
        var vimeo = await Video(h.Owner, "https://vimeo.com/987654");
        Assert.Equal(JsonValueKind.Null, (await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{vimeo}", Ct)).GetProperty("thumbnailReference").ValueKind);
        await Video(h.Owner, "https://internal.example.test/private"); Assert.Equal(2, h.Provider.Requests.Count);
        Assert.All(h.Provider.Requests, request => Assert.Contains(request.Host, new[] { "www.youtube.com", "vimeo.com" }));
    }

    [Fact]
    public async Task Provider_thumbnails_are_authorized_decoded_and_bounded_without_exposing_provider_urls()
    {
        await using var h = await Harness.Create(postgres); var item = await Video(h.Owner, "https://youtu.be/dQw4w9WgXcQ");
        using var pixels = new SixLabors.ImageSharp.Image<SixLabors.ImageSharp.PixelFormats.Rgba32>(16, 9);
        using var png = new MemoryStream(); await SixLabors.ImageSharp.ImageExtensions.SaveAsPngAsync(pixels, png, Ct);
        h.Provider.Response = _ => { var content = new ByteArrayContent(png.ToArray()); content.Headers.ContentType = new MediaTypeHeaderValue("image/png"); return new HttpResponseMessage(HttpStatusCode.OK) { Content = content }; };
        using var thumbnail = await h.Owner.GetAsync($"/api/library/items/{item}/thumbnail", Ct);
        Assert.Equal(HttpStatusCode.OK, thumbnail.StatusCode); Assert.Equal("image/png", thumbnail.Content.Headers.ContentType?.MediaType);
        Assert.Equal("no-store", thumbnail.Headers.CacheControl?.ToString()); Assert.Contains("nosniff", thumbnail.Headers.GetValues("X-Content-Type-Options"));
        using var decoded = await SixLabors.ImageSharp.Image.LoadAsync(await thumbnail.Content.ReadAsStreamAsync(Ct), Ct); Assert.True(decoded.Width <= 640); Assert.True(decoded.Height <= 360);
        var calls = h.Provider.Requests.Count; using var foreign = await h.Other.GetAsync($"/api/library/items/{item}/thumbnail", Ct); await Error(foreign, 404, LibraryErrors.NotFound); Assert.Equal(calls, h.Provider.Requests.Count);
        h.Provider.Response = _ => { var content = new ByteArrayContent(new byte[1_000_001]); content.Headers.ContentType = new MediaTypeHeaderValue("image/png"); return new HttpResponseMessage(HttpStatusCode.OK) { Content = content }; };
        using var tooBig = await h.Owner.GetAsync($"/api/library/items/{item}/thumbnail", Ct); await Error(tooBig, 503, LibraryErrors.ProcessingUnavailable);
        h.Provider.Response = _ => { var content = new StringContent("<script>unsafe</script>"); content.Headers.ContentType = new MediaTypeHeaderValue("image/png"); return new HttpResponseMessage(HttpStatusCode.OK) { Content = content }; };
        using var invalid = await h.Owner.GetAsync($"/api/library/items/{item}/thumbnail", Ct); await Error(invalid, 503, LibraryErrors.ProcessingUnavailable);
        h.Provider.Response = _ => new HttpResponseMessage(HttpStatusCode.Redirect) { Headers = { Location = new Uri("https://127.0.0.1/private") } };
        using var redirected = await h.Owner.GetAsync($"/api/library/items/{item}/thumbnail", Ct); await Error(redirected, 503, LibraryErrors.ProcessingUnavailable);
    }

    [Fact]
    public async Task Metadata_bounds_and_malformed_json_fail_soft_without_generic_url_fetches()
    {
        await using var h = await Harness.Create(postgres);
        h.Provider.Response = _ => new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { title = new string('x', 33000) }) };
        var big = await Video(h.Owner, "https://vimeo.com/123456");
        Assert.Equal("library_video_metadata_unavailable", (await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{big}", Ct)).GetProperty("metadataErrorCode").GetString());
        h.Provider.Response = _ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{invalid", System.Text.Encoding.UTF8, "application/json") };
        var invalid = await Video(h.Owner, "https://youtu.be/dQw4w9WgXcQ");
        Assert.Equal("library_video_metadata_unavailable", (await h.Owner.GetFromJsonAsync<JsonElement>($"/api/library/items/{invalid}", Ct)).GetProperty("metadataErrorCode").GetString());
    }

    [Fact]
    public async Task Organization_pages_have_protected_cursors_and_collection_counts_use_one_projection()
    {
        await using var h = await Harness.Create(postgres); await Folder(h.Owner, "video", "A"); await Folder(h.Owner, "video", "B");
        var first = (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryFolderDto>>("/api/library/folders?limit=1", Ct))!;
        var second = (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryFolderDto>>("/api/library/folders?limit=1&cursor=" + Uri.EscapeDataString(first.NextCursor!), Ct))!;
        Assert.NotEqual(first.Items.Single().Id, second.Items.Single().Id); Assert.Null(second.NextCursor);
        await Collection(h.Owner); await Collection(h.Owner); var collections = (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryCollectionDto>>("/api/library/collections?limit=1", Ct))!;
        var more = (await h.Owner.GetFromJsonAsync<LibraryPageDto<LibraryCollectionDto>>("/api/library/collections?limit=1&cursor=" + Uri.EscapeDataString(collections.NextCursor!), Ct))!;
        Assert.NotEqual(collections.Items.Single().Id, more.Items.Single().Id); Assert.Null(more.NextCursor);
        using var invalid = await h.Owner.GetAsync("/api/library/collections?limit=1&cursor=" + Uri.EscapeDataString(first.NextCursor!), Ct); await Error(invalid, 400, LibraryErrors.InvalidCursor);
    }

    [Fact]
    public async Task List_projection_does_not_load_code_source_and_does_not_issue_queries_per_row()
    {
        await using var h = await Harness.Create(postgres); await SeedDocument(h, "source canary", true);
        var counter = new CommandCounterInterceptor();
        await using var factory = new LibraryFactory(postgres, h.Clock, counter: counter); using var client = Client(factory, h.A, h.Clock);
        var page = (await client.GetFromJsonAsync<LibraryPageDto<LibraryItemSummaryDto>>("/api/library/items", Ct))!;
        Assert.Single(page.Items); Assert.Equal(2, counter.Count); Assert.DoesNotContain(counter.Commands, sql => sql.Contains("source_text", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Rate_limits_use_the_library_error_contract_and_are_partitioned_by_owner()
    {
        await using var h = await Harness.Create(postgres);
        await using var factory = new LibraryFactory(postgres, h.Clock, readLimit: 1);
        using var client = Client(factory, h.A, h.Clock); using var other = Client(factory, new User { Id = h.OtherId }, h.Clock);
        using var first = await client.GetAsync("/api/library/capabilities", Ct); Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        using var rejected = await client.GetAsync("/api/library/capabilities", Ct); await Error(rejected, 429, LibraryErrors.RateLimited); Assert.True(rejected.Headers.RetryAfter?.Delta > TimeSpan.Zero);
        using var independent = await other.GetAsync("/api/library/capabilities", Ct); Assert.Equal(HttpStatusCode.OK, independent.StatusCode);
    }

    [Fact]
    public async Task Account_ceiling_caps_legacy_entitlements_and_retains_existing_files_over_quota()
    {
        await using var h = await Harness.Create(postgres);
        var item = await SeedDocument(h, "Retained document", true);
        await using (var db = postgres.CreateContext())
        {
            var entitlement = await db.StorageEntitlements.SingleAsync(Ct);
            entitlement.QuotaBytes = 5_000_000_000;
            db.Add(new LibraryBlobWork { UserId = h.A.Id, ObjectKey = "library/available/" + Guid.NewGuid().ToString("N"),
                Purpose = LibraryBlobWorkPurpose.Delete, ChargedBytes = 1_000_000_000,
                CreatedAt = h.Clock.GetUtcNow(), DueAt = h.Clock.GetUtcNow().AddHours(1) });
            await db.SaveChangesAsync(Ct);
        }
        var storage = (await h.Owner.GetFromJsonAsync<LibraryStorageSummaryDto>("/api/library/storage", Ct))!;
        Assert.Equal(1_000_000_000, storage.QuotaBytes); Assert.Equal(0, storage.AvailableBytes);
        Assert.Equal(1_000_000_016, storage.UsedBytes);
        using var denied = await Send(h.Owner, HttpMethod.Post, "/uploads", UploadInput(Guid.NewGuid()));
        await Error(denied, 409, LibraryErrors.QuotaExceeded);
        using var detail = await h.Owner.GetAsync($"/api/library/items/{item}", Ct); Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        using var rename = await Send(h.Owner, HttpMethod.Patch, $"/items/{item}", new { name = "Still retained" });
        Assert.Equal(HttpStatusCode.NoContent, rename.StatusCode);
    }

    [Fact]
    public async Task Storage_plans_require_auth_and_disabled_checkout_cannot_grant_capacity()
    {
        await using var h = await Harness.Create(postgres);
        using var anonymous = h.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/subscriptions/storage-plans", Ct)).StatusCode);
        var plans = (await h.Owner.GetFromJsonAsync<Wukna.Features.Subscriptions.StoragePlanDto[]>("/api/subscriptions/storage-plans", Ct))!;
        Assert.Equal(1_000_000_000, plans.Single(plan => plan.Id == "free").QuotaBytes);
        Assert.Equal(3, plans.Length); Assert.All(plans, plan => Assert.False(plan.CheckoutEnabled));
        var provider = h.Factory.Services.GetRequiredService<Wukna.Features.Subscriptions.IStorageSubscriptionProvider>();
        Assert.False(provider.CheckoutEnabled);
        foreach (var plan in new[] { "plus", "pro", "unknown" })
        {
            var checkout = await provider.CreateCheckout(h.A.Id, plan, Ct);
            Assert.Equal("subscription_checkout_unavailable", checkout.Code); Assert.Null(checkout.CheckoutUrl);
        }
        using var missing = await h.Owner.PostAsJsonAsync("/api/subscriptions/checkout", new { planId = "pro" }, Ct);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        var storage = (await h.Owner.GetFromJsonAsync<LibraryStorageSummaryDto>("/api/library/storage", Ct))!;
        Assert.Equal(1_000_000_000, storage.QuotaBytes); Assert.Equal("free", storage.EntitlementSource);
    }

    private static async Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, object? body)
    {
        using var request = new HttpRequestMessage(method, "/api/library" + path);
        if (body is not null) request.Content = JsonContent.Create(body);
        return await client.SendAsync(request, Ct);
    }
    private static async Task Error(HttpResponseMessage response, int status, string code)
    { Assert.Equal(status, (int)response.StatusCode); Assert.Equal(code, (await response.Content.ReadFromJsonAsync<LibraryErrorDto>(Ct))!.Code); }
    private static async Task Action(HttpClient client, string action, params Guid[] ids)
    { using var response = await Send(client, HttpMethod.Post, "/items/" + action, new { ids }); Assert.Equal(HttpStatusCode.NoContent, response.StatusCode); }
    private static async Task<Guid> Video(HttpClient client, string url, Guid? folder = null)
    {
        using var response = await Send(client, HttpMethod.Post, "/videos", new { name = "Saved video", url, folderId = folder, description = (string?)null });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); return (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("id").GetGuid();
    }
    private static async Task<LibraryFolderDto> Folder(HttpClient client, string category, string name = "Folder", Guid? parent = null)
    { using var response = await Send(client, HttpMethod.Post, "/folders", new { name, category, parentId = parent }); Assert.Equal(HttpStatusCode.Created, response.StatusCode); return (await response.Content.ReadFromJsonAsync<LibraryFolderDto>(Ct))!; }
    private static async Task<LibraryCollectionDto> Collection(HttpClient client)
    { using var response = await Send(client, HttpMethod.Post, "/collections", new { name = "Collection", description = "Description" }); Assert.Equal(HttpStatusCode.Created, response.StatusCode); return (await response.Content.ReadFromJsonAsync<LibraryCollectionDto>(Ct))!; }
    private static LibraryUploadCreateRequest UploadInput(Guid id, Guid? folder = null) => new(id, "document", "file.txt", "text/plain", 16, new string('a', 64), folder);
    private static async Task<LibraryUploadSessionDto> Upload(HttpClient client, Guid? folder = null)
    { using var response = await Send(client, HttpMethod.Post, "/uploads", UploadInput(Guid.NewGuid(), folder)); Assert.Equal(HttpStatusCode.Created, response.StatusCode); return (await response.Content.ReadFromJsonAsync<LibraryUploadSessionDto>(Ct))!; }
    private async Task<Guid> SeedDocument(Harness h, string source, bool available)
    {
        _ = await h.Owner.GetFromJsonAsync<LibraryStorageSummaryDto>("/api/library/storage", Ct);
        await using var db = postgres.CreateContext(); var now = h.Clock.GetUtcNow();
        var item = new LibraryItem { UserId = h.A.Id, Category = LibraryCategory.Document, Name = "document.ts", CreatedAt = now, UpdatedAt = now };
        db.Add(item); db.Add(new LibraryAsset { ItemId = item.Id, UserId = h.A.Id, Category = LibraryCategory.Document, OriginalFileName = "document.ts", SizeBytes = 16, StoredBytes = 16,
            ContentType = "text/plain", Checksum = new string('a', 64), OriginalStorageKey = "library/" + (available ? "available/" : "quarantine/") + Guid.NewGuid().ToString("N"), VerifiedAt = now,
            ScannedAt = available ? now : null, ScanVerdict = available ? LibraryScanVerdict.Clean : null,
            ProcessingStatus = available ? LibraryProcessingStatus.Available : LibraryProcessingStatus.Processing, CreatedAt = now, UpdatedAt = now });
        db.Add(new LibraryDocument { UserId = h.A.Id, ItemId = item.Id, PreviewKind = LibraryDocumentKind.Code, SourceText = source, Encoding = "utf-8", Language = "typescript" });
        await db.SaveChangesAsync(Ct); return item.Id;
    }
    private static StorageReservation Completed(Harness h, Guid item) => new() { UserId = h.A.Id, ClientUploadId = Guid.NewGuid(), RequestFingerprint = new string('a', 64), Category = LibraryCategory.Document,
        FileName = "file.txt", DeclaredContentType = "text/plain", DeclaredSizeBytes = 16, DeclaredChecksum = new string('a', 64), State = LibraryUploadState.Complete, ResultItemId = item,
        CompletedAt = h.Clock.GetUtcNow(), CreatedAt = h.Clock.GetUtcNow(), UpdatedAt = h.Clock.GetUtcNow(), ExpiresAt = h.Clock.GetUtcNow().AddMinutes(15) };
    private static HttpClient Client(WuknaWebApplicationFactory factory, User user, TimeProvider clock)
    {
        var client = factory.CreateClient(); var token = new JwtTokenGenerator(new JwtOptions { Issuer = WuknaWebApplicationFactory.JwtIssuer, Audience = WuknaWebApplicationFactory.JwtAudience,
            SigningKey = WuknaWebApplicationFactory.JwtSigningKey, AccessTokenMinutes = 120, RefreshTokenDays = 7 }, clock).CreateAccessToken(user).Token;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token); return client;
    }
    private sealed class ProviderHandler : HttpMessageHandler
    {
        public System.Collections.Concurrent.ConcurrentQueue<Uri> Requests { get; } = new();
        public Func<HttpRequestMessage, HttpResponseMessage>? Response { get; set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests.Enqueue(request.RequestUri!); return Task.FromResult(Response?.Invoke(request) ?? new HttpResponseMessage(HttpStatusCode.OK) {
                Content = JsonContent.Create(new { title = "Provider title", author_name = "Creator", thumbnail_url = request.RequestUri!.Host == "vimeo.com" ? "https://i.vimeocdn.com/video/test.jpg" : "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" }) });
        }
    }
    private sealed class LibraryFactory(PostgresFixture postgres, ManualTimeProvider clock, ProviderHandler? provider = null, long? quota = null, CommandCounterInterceptor? counter = null, int? readLimit = null) : WuknaWebApplicationFactory(postgres, clock)
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder); if (quota is not null) builder.UseSetting("Library:FreeQuotaBytes", quota.Value.ToString(System.Globalization.CultureInfo.InvariantCulture));
            if (readLimit is not null) builder.UseSetting("Library:ReadRequestsPerMinute", readLimit.Value.ToString(System.Globalization.CultureInfo.InvariantCulture));
            builder.ConfigureServices(services => services.AddHttpClient("library-video-provider").ConfigurePrimaryHttpMessageHandler(() => provider ?? new ProviderHandler()));
            if (counter is not null) builder.ConfigureServices(services => services.AddDbContext<Wukna.Shared.Data.AppDbContext.WuknaDbContext>(options => options.AddInterceptors(counter)));
        }
    }
    private sealed class Harness : IAsyncDisposable
    {
        public required User A { get; init; }
        public required Guid OtherId { get; init; }
        public required ManualTimeProvider Clock { get; init; }
        public required LibraryFactory Factory { get; init; }
        public required ProviderHandler Provider { get; init; }
        public required HttpClient Owner { get; init; }
        public required HttpClient Other { get; init; }
        public required HttpClient Anonymous { get; init; }
        public static async Task<Harness> Create(PostgresFixture postgres, long? quota = null)
        {
            await postgres.ResetAsync(Ct); var a = new User { Email = "library-owner@wukna.test", NormalizedEmail = "LIBRARY-OWNER@WUKNA.TEST" }; var b = new User { Email = "library-other@wukna.test", NormalizedEmail = "LIBRARY-OTHER@WUKNA.TEST" };
            await using (var db = postgres.CreateContext()) { db.AddRange(a, b); await db.SaveChangesAsync(Ct); }
            var clock = new ManualTimeProvider(DateTimeOffset.UtcNow); var provider = new ProviderHandler(); var factory = new LibraryFactory(postgres, clock, provider, quota);
            return new Harness { A = a, OtherId = b.Id, Clock = clock, Factory = factory, Provider = provider, Owner = Client(factory, a, clock), Other = Client(factory, b, clock), Anonymous = factory.CreateClient() };
        }
        public async ValueTask DisposeAsync() { Owner.Dispose(); Other.Dispose(); Anonymous.Dispose(); await Factory.DisposeAsync(); }
    }
}
