namespace Wukna.IntegrationTests;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Wukna.Features.Board;
using Wukna.Features.Chat;
using Wukna.Features.Library;
using Wukna.Features.Tasks;
using Wukna.Features.Users;
using Wukna.Shared.Data.AppDbContext;
using Xunit;

public sealed class LibrarySchemaTests(PostgresFixture postgres)
{
    private const string PreviousMigration = "20261009181230_AddBoardCardAppearance";
    private static readonly DateTimeOffset Now = new(2026, 10, 11, 10, 0, 0, TimeSpan.Zero);
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Additive_migration_preserves_existing_domains_and_replays_without_model_drift()
    {
        await using var db = postgres.CreateContext();
        await db.Database.EnsureDeletedAsync(Ct);
        var migrator = db.Database.GetService<IMigrator>();
        await migrator.MigrateAsync(PreviousMigration, Ct);
        var user = new User { Email = "library-migration@wukna.test", NormalizedEmail = "LIBRARY-MIGRATION@WUKNA.TEST", DisplayName = "Preserved profile", ProfileImageKey = "existing-profile.webp" };
        var board = new Board { Title = "Existing board", CardColor = "sage", CardColorVersion = 1 };
        board.Memberships.Add(new BoardMembership { User = user, Role = BoardRole.Owner, CanEdit = true });
        db.Add(board);
        db.Add(new PersonalTask { User = user, Title = "Existing task" });
        db.Add(new ChatMessage { BoardId = board.Id, SenderUserId = user.Id, Sequence = 1, Body = "Existing chat", ClientMessageId = Guid.NewGuid(), RequestFingerprint = new string('a', 64) });
        await db.SaveChangesAsync(Ct);

        await migrator.MigrateAsync(cancellationToken: Ct);
        await migrator.MigrateAsync(cancellationToken: Ct);
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Equal("Existing board", (await db.Boards.SingleAsync(Ct)).Title);
        Assert.Equal("Existing chat", (await db.ChatMessages.SingleAsync(Ct)).Body);
        Assert.Equal("Existing task", (await db.PersonalTasks.SingleAsync(Ct)).Title);
        Assert.Equal("Preserved profile", (await db.Users.SingleAsync(Ct)).DisplayName);
        Assert.True((await db.BoardMemberships.SingleAsync(Ct)).CanEdit);
        Assert.Empty(await db.LibraryItems.ToArrayAsync(Ct));
        db.Add(new StorageEntitlement { UserId = user.Id });
        await db.SaveChangesAsync(Ct);
        db.ChangeTracker.Clear();
        Assert.Equal(1_000_000_000, (await db.StorageEntitlements.SingleAsync(Ct)).QuotaBytes);
        Assert.Equal(StorageEntitlementSource.Free, (await db.StorageEntitlements.SingleAsync(Ct)).Source);
        // Rollback/reapply only this new migration, exclusively inside the disposable fixture.
        await migrator.MigrateAsync(PreviousMigration, Ct);
        Assert.Equal(1, await db.PersonalTasks.CountAsync(Ct));
        await migrator.MigrateAsync(cancellationToken: Ct);
        Assert.Empty(await db.StorageEntitlements.ToArrayAsync(Ct));
    }

    [Fact]
    public async Task Quota_migration_lowers_legacy_accounts_without_removing_files_or_cleanup_charge()
    {
        await using var db = postgres.CreateContext(); await db.Database.EnsureDeletedAsync(Ct);
        var migrator = db.Database.GetService<IMigrator>();
        await migrator.MigrateAsync("20261011134920_AddLibraryVideoMetadata", Ct);
        var owner = new User(); var limited = new User(); db.AddRange(owner, limited);
        db.AddRange(new StorageEntitlement { UserId = owner.Id, QuotaBytes = 5_000_000_000, CreatedAt = Now, UpdatedAt = Now },
            new StorageEntitlement { UserId = limited.Id, QuotaBytes = 100, Source = StorageEntitlementSource.Manual, CreatedAt = Now, UpdatedAt = Now });
        var item = Item(owner.Id, LibraryCategory.Document, null); var asset = Asset(item.Id, owner.Id); MakeAvailable(asset);
        db.Add(item); db.Add(asset);
        db.Add(new LibraryBlobWork { UserId = owner.Id, ObjectKey = Key(true), Purpose = LibraryBlobWorkPurpose.Delete,
            ChargedBytes = 20, CreatedAt = Now, DueAt = Now.AddHours(1) });
        await db.SaveChangesAsync(Ct);
        var originalKey = asset.OriginalStorageKey;
        await migrator.MigrateAsync(cancellationToken: Ct); await migrator.MigrateAsync(cancellationToken: Ct); db.ChangeTracker.Clear();
        Assert.Equal(1_000_000_000, (await db.StorageEntitlements.SingleAsync(row => row.UserId == owner.Id, Ct)).QuotaBytes);
        Assert.Equal(100, (await db.StorageEntitlements.SingleAsync(row => row.UserId == limited.Id, Ct)).QuotaBytes);
        Assert.Equal(originalKey, (await db.LibraryAssets.SingleAsync(Ct)).OriginalStorageKey);
        Assert.Equal(36, (await LibraryReservations.Storage(db, await db.StorageEntitlements.SingleAsync(row => row.UserId == owner.Id, Ct), Ct)).UsedBytes);
        Assert.Single(await db.LibraryItems.ToArrayAsync(Ct)); Assert.False(db.Database.HasPendingModelChanges());
        // Rolling back the default cannot infer or restore a previous account grant.
        await migrator.MigrateAsync("20261011134920_AddLibraryVideoMetadata", Ct); db.ChangeTracker.Clear();
        Assert.Equal(1_000_000_000, (await db.StorageEntitlements.SingleAsync(row => row.UserId == owner.Id, Ct)).QuotaBytes);
        await migrator.MigrateAsync(cancellationToken: Ct);
    }

    [Theory]
    [InlineData("folder_parent_owner")]
    [InlineData("folder_parent_category")]
    [InlineData("item_folder_owner")]
    [InlineData("item_folder_category")]
    [InlineData("collection_owner")]
    [InlineData("collection_item_owner")]
    [InlineData("asset_owner")]
    [InlineData("asset_category")]
    [InlineData("document_category")]
    [InlineData("video_category")]
    [InlineData("reservation_folder_owner")]
    [InlineData("reservation_result_owner")]
    public async Task Database_rejects_cross_owner_and_cross_category_links(string invalidCase)
    {
        var seed = await SeedAsync();
        await RejectedAsync(db =>
        {
            switch (invalidCase)
            {
                case "folder_parent_owner": db.Add(new LibraryFolder { UserId = seed.A, Category = LibraryCategory.Document, Name = "Invalid", ParentId = seed.FolderB }); break;
                case "folder_parent_category": db.Add(new LibraryFolder { UserId = seed.A, Category = LibraryCategory.Picture, Name = "Invalid", ParentId = seed.FolderA }); break;
                case "item_folder_owner": db.Add(Item(seed.A, LibraryCategory.Document, seed.FolderB)); break;
                case "item_folder_category": db.Add(Item(seed.A, LibraryCategory.Picture, seed.FolderA)); break;
                case "collection_owner": db.Add(new LibraryCollectionItem { CollectionId = seed.CollectionB, ItemId = seed.ItemA, UserId = seed.A }); break;
                case "collection_item_owner": db.Add(new LibraryCollectionItem { CollectionId = seed.CollectionA, ItemId = seed.ItemB, UserId = seed.A }); break;
                case "asset_owner": db.Add(Asset(seed.ItemA, seed.B)); break;
                case "asset_category": var asset = Asset(seed.ItemB, seed.B); asset.Category = LibraryCategory.Picture; db.Add(asset); break;
                case "document_category": db.Add(new LibraryDocument { ItemId = seed.PictureA, UserId = seed.A }); break;
                case "video_category": db.Add(new LibraryVideo { ItemId = seed.ItemA, UserId = seed.A, Provider = LibraryVideoProvider.External, Url = "https://example.test/video" }); break;
                case "reservation_folder_owner": var upload = Upload(seed.A); upload.FolderId = seed.FolderB; db.Add(upload); break;
                case "reservation_result_owner": var completed = Upload(seed.A); completed.State = LibraryUploadState.Processing; completed.ResultItemId = seed.ItemB; db.Add(completed); break;
                default: throw new ArgumentOutOfRangeException(nameof(invalidCase));
            }
        }, PostgresErrorCodes.ForeignKeyViolation);
    }

    [Fact]
    public async Task Root_and_nested_folder_names_are_normalized_unique_and_scoped()
    {
        var seed = await SeedAsync();
        await RejectedAsync(db => db.Add(new LibraryFolder { UserId = seed.A, Category = LibraryCategory.Document, Name = "  dOcS  " }), PostgresErrorCodes.UniqueViolation);
        await using var db = postgres.CreateContext();
        var child = new LibraryFolder { UserId = seed.A, Category = LibraryCategory.Document, ParentId = seed.FolderA, Name = "Child" };
        db.Add(child);
        db.Add(new LibraryFolder { UserId = seed.A, Category = LibraryCategory.Picture, Name = "Docs" });
        await db.SaveChangesAsync(Ct);
        Assert.Equal(1, child.Depth);
        Assert.Equal("CHILD", child.NormalizedName);
        await RejectedAsync(other => other.Add(new LibraryFolder { UserId = seed.A, Category = LibraryCategory.Document, ParentId = seed.FolderA, Name = "child" }), PostgresErrorCodes.UniqueViolation);
    }

    [Fact]
    public async Task Hierarchy_is_bounded_and_cannot_be_reparented_into_a_cycle()
    {
        var seed = await SeedAsync();
        await using var db = postgres.CreateContext();
        var parent = seed.FolderA;
        for (var depth = 1; depth <= 32; depth++)
        {
            var child = new LibraryFolder { UserId = seed.A, Category = LibraryCategory.Document, ParentId = parent, Name = $"Level {depth}" };
            db.Add(child); await db.SaveChangesAsync(Ct);
            Assert.Equal(depth, child.Depth); parent = child.Id;
        }
        var last = parent;
        await RejectedAsync(other => other.Add(new LibraryFolder { UserId = seed.A, Category = LibraryCategory.Document, ParentId = last, Name = "Too deep" }), PostgresErrorCodes.CheckViolation);
        var exception = await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE library_folders SET parent_id = {last} WHERE id = {seed.FolderA}", Ct));
        Assert.Equal(PostgresErrorCodes.CheckViolation, exception.SqlState);
    }

    [Theory]
    [InlineData("child")]
    [InlineData("trash")]
    [InlineData("reservation")]
    public async Task Folder_delete_restricts_children_trashed_items_and_live_reservations(string pin)
    {
        var seed = await SeedAsync();
        await using var db = postgres.CreateContext();
        var folder = new LibraryFolder { UserId = seed.A, Category = LibraryCategory.Document, Name = "Pinned" };
        db.Add(folder); await db.SaveChangesAsync(Ct);
        if (pin == "child") db.Add(new LibraryFolder { UserId = seed.A, Category = LibraryCategory.Document, ParentId = folder.Id, Name = "Child" });
        if (pin == "trash") { var item = Item(seed.A, LibraryCategory.Document, folder.Id); item.DeletedAt = Now; db.Add(item); }
        if (pin == "reservation") { var upload = Upload(seed.A); upload.FolderId = folder.Id; db.Add(upload); }
        await db.SaveChangesAsync(Ct);
        var exception = await Assert.ThrowsAsync<PostgresException>(() => db.LibraryFolders.Where(row => row.Id == folder.Id).ExecuteDeleteAsync(Ct));
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, exception.SqlState);
    }

    [Fact]
    public async Task Membership_is_unique_trash_keeps_links_and_collection_deletion_preserves_files()
    {
        var seed = await SeedAsync();
        await using var db = postgres.CreateContext();
        db.Add(new LibraryCollectionItem { UserId = seed.A, CollectionId = seed.CollectionA, ItemId = seed.ItemA });
        await db.SaveChangesAsync(Ct);
        await RejectedAsync(other => other.Add(new LibraryCollectionItem { UserId = seed.A, CollectionId = seed.CollectionA, ItemId = seed.ItemA }), PostgresErrorCodes.UniqueViolation);
        await db.LibraryItems.Where(row => row.Id == seed.ItemA).ExecuteUpdateAsync(set => set.SetProperty(row => row.DeletedAt, Now), Ct);
        Assert.Equal(1, await db.LibraryCollectionItems.CountAsync(Ct));
        await db.LibraryItems.Where(row => row.Id == seed.ItemA).ExecuteUpdateAsync(set => set.SetProperty(row => row.DeletedAt, (DateTimeOffset?)null), Ct);
        await db.LibraryCollections.Where(row => row.Id == seed.CollectionA).ExecuteDeleteAsync(Ct);
        Assert.Empty(await db.LibraryCollectionItems.ToArrayAsync(Ct));
        Assert.True(await db.LibraryItems.AnyAsync(row => row.Id == seed.ItemA, Ct));
        Assert.True(await db.LibraryAssets.AnyAsync(row => row.ItemId == seed.ItemA, Ct));
    }

    [Fact]
    public async Task Purge_requires_explicit_binary_cleanup_and_retains_work_and_idempotency_tombstone()
    {
        var seed = await SeedAsync();
        await using var db = postgres.CreateContext();
        var asset = await db.LibraryAssets.SingleAsync(row => row.ItemId == seed.ItemA, Ct);
        MakeAvailable(asset);
        var upload = Upload(seed.A); upload.State = LibraryUploadState.Complete; upload.ReservedBytes = 0;
        upload.ResultItemId = seed.ItemA; upload.CompletedAt = Now;
        db.Add(upload); await db.SaveChangesAsync(Ct);
        var exception = await Assert.ThrowsAsync<PostgresException>(() => db.LibraryItems.Where(row => row.Id == seed.ItemA).ExecuteDeleteAsync(Ct));
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, exception.SqlState);
        await using (var tx = await db.Database.BeginTransactionAsync(Ct))
        {
            upload.ResultItemId = null; upload.ResultPurgedAt = Now;
            db.Add(new LibraryBlobWork { UserId = seed.A, AssetId = asset.Id, Purpose = LibraryBlobWorkPurpose.Delete,
                ObjectKey = asset.OriginalStorageKey!, ChargedBytes = asset.StoredBytes, CreatedAt = Now, DueAt = Now });
            await db.SaveChangesAsync(Ct);
            await db.LibraryAssets.Where(row => row.ItemId == seed.ItemA).ExecuteDeleteAsync(Ct);
            await db.LibraryItems.Where(row => row.Id == seed.ItemA).ExecuteDeleteAsync(Ct);
            await tx.CommitAsync(Ct);
        }
        Assert.False(await db.LibraryDocuments.AnyAsync(row => row.ItemId == seed.ItemA, Ct));
        Assert.Equal(16, (await db.LibraryBlobWork.SingleAsync(Ct)).ChargedBytes);
        Assert.NotNull((await db.StorageReservations.SingleAsync(Ct)).ResultPurgedAt);
        Assert.False(await db.LibraryItems.AnyAsync(row => row.Id == seed.ItemA, Ct));
    }

    [Fact]
    public async Task Reservation_idempotency_is_per_owner_and_processing_can_transfer_charge_to_assets()
    {
        var seed = await SeedAsync();
        var operation = Guid.NewGuid();
        await using var db = postgres.CreateContext();
        var a = Upload(seed.A); a.ClientUploadId = operation; db.Add(a);
        var b = Upload(seed.B); b.ClientUploadId = operation; db.Add(b);
        await db.SaveChangesAsync(Ct);
        await RejectedAsync(other => { var duplicate = Upload(seed.A); duplicate.ClientUploadId = operation; other.Add(duplicate); }, PostgresErrorCodes.UniqueViolation);
        var asset = await db.LibraryAssets.SingleAsync(row => row.ItemId == seed.ItemA, Ct);
        asset.SizeBytes = 16; asset.StoredBytes = 16;
        a.State = LibraryUploadState.Processing; a.ResultItemId = seed.ItemA; a.ReservedBytes = 0;
        await db.SaveChangesAsync(Ct);
        Assert.Equal(16, await db.LibraryAssets.Where(row => row.UserId == seed.A).SumAsync(row => row.StoredBytes, Ct));
        Assert.Equal(0, await db.StorageReservations.Where(row => row.UserId == seed.A).SumAsync(row => row.ReservedBytes, Ct));
    }

    [Fact]
    public async Task Completion_requires_available_asset_and_can_be_finalized_in_one_transaction()
    {
        var seed = await SeedAsync();
        await RejectedAsync(db => { var upload = Upload(seed.A); upload.State = LibraryUploadState.Complete;
            upload.ReservedBytes = 0; upload.ResultItemId = seed.ItemA; upload.CompletedAt = Now; db.Add(upload); }, PostgresErrorCodes.CheckViolation);
        await using var db = postgres.CreateContext();
        var completed = Upload(seed.A); completed.State = LibraryUploadState.Complete;
        completed.ReservedBytes = 0; completed.ResultItemId = seed.ItemA; completed.CompletedAt = Now;
        await using (var tx = await db.Database.BeginTransactionAsync(Ct))
        {
            db.Add(completed); await db.SaveChangesAsync(Ct);
            MakeAvailable(await db.LibraryAssets.SingleAsync(row => row.ItemId == seed.ItemA, Ct));
            await db.SaveChangesAsync(Ct); await tx.CommitAsync(Ct);
        }
        Assert.Equal(LibraryUploadState.Complete, (await db.StorageReservations.SingleAsync(Ct)).State);
    }

    [Theory]
    [InlineData("available_without_scan")]
    [InlineData("available_null_verdict")]
    [InlineData("available_quarantine")]
    [InlineData("scan_without_verdict")]
    [InlineData("infected_available")]
    [InlineData("asset_negative_size")]
    [InlineData("asset_invalid_key")]
    [InlineData("asset_path_filename")]
    [InlineData("asset_category_video")]
    [InlineData("code_missing_source")]
    [InlineData("code_missing_encoding")]
    [InlineData("code_oversized_utf8")]
    [InlineData("video_bad_id")]
    [InlineData("video_http")]
    [InlineData("tags_too_many")]
    [InlineData("tags_too_long")]
    [InlineData("tags_null_element")]
    [InlineData("quota_negative")]
    [InlineData("upload_no_budget")]
    [InlineData("upload_empty_operation")]
    [InlineData("upload_bad_checksum")]
    [InlineData("upload_no_receiving_lease")]
    [InlineData("upload_half_lease")]
    [InlineData("upload_complete_without_result")]
    [InlineData("work_invalid_key")]
    [InlineData("work_scan_without_asset")]
    [InlineData("work_double_charge_scan")]
    [InlineData("work_half_lease")]
    public async Task Database_rejects_invalid_state_and_size_records(string invalidCase)
    {
        var seed = await SeedAsync();
        await RejectedAsync(async db =>
        {
            if (invalidCase.StartsWith("available_", StringComparison.Ordinal) || invalidCase is "scan_without_verdict" or "infected_available" or "asset_negative_size" or "asset_invalid_key" or "asset_path_filename" or "asset_category_video")
            {
                var asset = await db.LibraryAssets.SingleAsync(row => row.ItemId == seed.ItemA, Ct);
                switch (invalidCase)
                {
                    case "available_without_scan": asset.ProcessingStatus = LibraryProcessingStatus.Available; break;
                    case "available_null_verdict": MakeAvailable(asset); asset.ScanVerdict = null; break;
                    case "available_quarantine": MakeAvailable(asset); asset.OriginalStorageKey = Key(false); break;
                    case "scan_without_verdict": asset.ScannedAt = Now; break;
                    case "infected_available": MakeAvailable(asset); asset.ScanVerdict = LibraryScanVerdict.Infected; break;
                    case "asset_negative_size": asset.SizeBytes = -1; break;
                    case "asset_invalid_key": asset.OriginalStorageKey = "../../private"; break;
                    case "asset_path_filename": asset.OriginalFileName = "folder\\file.txt"; break;
                    case "asset_category_video":
                        // Category is an EF alternate key; use a new malformed row rather than changing a tracked key.
                        db.Add(new LibraryAsset { ItemId = seed.VideoA, UserId = seed.A, Category = LibraryCategory.Video, OriginalFileName = "video" }); break;
                }
            }
            else if (invalidCase.StartsWith("code_", StringComparison.Ordinal))
            {
                var document = await db.LibraryDocuments.SingleAsync(row => row.ItemId == seed.ItemA, Ct);
                document.PreviewKind = LibraryDocumentKind.Code; document.Language = "typescript";
                document.SourceText = "const value = 1;"; document.Encoding = "utf-8";
                if (invalidCase == "code_missing_source") document.SourceText = null;
                if (invalidCase == "code_missing_encoding") document.Encoding = null;
                if (invalidCase == "code_oversized_utf8") document.SourceText = new string('é', 128001);
            }
            else if (invalidCase.StartsWith("video_", StringComparison.Ordinal))
                db.Add(new LibraryVideo { ItemId = seed.VideoA, UserId = seed.A, Provider = invalidCase == "video_http" ? LibraryVideoProvider.External : LibraryVideoProvider.Youtube,
                    Url = invalidCase == "video_http" ? "http://example.test/video" : "https://www.youtube.com/watch?v=bad", VideoId = invalidCase == "video_http" ? null : "bad" });
            else if (invalidCase.StartsWith("tags_", StringComparison.Ordinal))
            {
                var item = await db.LibraryItems.SingleAsync(row => row.Id == seed.ItemA, Ct);
                item.Tags = invalidCase switch { "tags_too_many" => Enumerable.Repeat("tag", 13).ToArray(), "tags_too_long" => [new string('a', 41)], _ => [null!] };
            }
            else if (invalidCase == "quota_negative")
                (await db.StorageEntitlements.SingleAsync(row => row.UserId == seed.A, Ct)).QuotaBytes = -1;
            else if (invalidCase.StartsWith("upload_", StringComparison.Ordinal))
            {
                var upload = Upload(seed.A);
                switch (invalidCase)
                {
                    case "upload_no_budget": upload.ReservedBytes = 0; break;
                    case "upload_empty_operation": upload.ClientUploadId = Guid.Empty; break;
                    case "upload_bad_checksum": upload.DeclaredChecksum = "placeholder"; break;
                    case "upload_no_receiving_lease": upload.State = LibraryUploadState.Receiving; break;
                    case "upload_half_lease": upload.AttemptId = Guid.NewGuid(); upload.LeaseToken = Guid.NewGuid(); break;
                    case "upload_complete_without_result": upload.State = LibraryUploadState.Complete; upload.ReservedBytes = 0; upload.CompletedAt = Now; break;
                }
                db.Add(upload);
            }
            else
            {
                var work = new LibraryBlobWork { UserId = seed.A, Purpose = LibraryBlobWorkPurpose.Delete, ObjectKey = Key(false), CreatedAt = Now, DueAt = Now };
                switch (invalidCase)
                {
                    case "work_invalid_key": work.ObjectKey = "public/object"; break;
                    case "work_scan_without_asset": work.Purpose = LibraryBlobWorkPurpose.Scan; break;
                    case "work_double_charge_scan": work.Purpose = LibraryBlobWorkPurpose.Scan; work.AssetId = seed.AssetA; work.ChargedBytes = 16; break;
                    case "work_half_lease": work.LeaseToken = Guid.NewGuid(); break;
                    default: throw new ArgumentOutOfRangeException(nameof(invalidCase));
                }
                db.Add(work);
            }
        }, PostgresErrorCodes.CheckViolation);
    }

    private Task RejectedAsync(Action<WuknaDbContext> change, string code) => RejectedAsync(db => { change(db); return Task.CompletedTask; }, code);

    private async Task RejectedAsync(Func<WuknaDbContext, Task> change, string code)
    {
        await using var db = postgres.CreateContext(); await change(db);
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync(Ct));
        Assert.Equal(code, Assert.IsType<PostgresException>(exception.InnerException).SqlState);
    }

    private sealed record Seed(Guid A, Guid B, Guid FolderA, Guid FolderB, Guid ItemA, Guid ItemB, Guid PictureA, Guid VideoA, Guid CollectionA, Guid CollectionB, Guid AssetA);

    private async Task<Seed> SeedAsync()
    {
        await postgres.ResetAsync(Ct);
        await using var db = postgres.CreateContext();
        var a = new User { Email = "library-a@wukna.test", NormalizedEmail = "LIBRARY-A@WUKNA.TEST" };
        var b = new User { Email = "library-b@wukna.test", NormalizedEmail = "LIBRARY-B@WUKNA.TEST" };
        db.AddRange(a, b);
        db.AddRange(new StorageEntitlement { UserId = a.Id }, new StorageEntitlement { UserId = b.Id });
        var folderA = new LibraryFolder { UserId = a.Id, Category = LibraryCategory.Document, Name = "Docs" };
        var folderB = new LibraryFolder { UserId = b.Id, Category = LibraryCategory.Document, Name = "Docs" };
        db.AddRange(folderA, folderB);
        var itemA = Item(a.Id, LibraryCategory.Document, folderA.Id); var itemB = Item(b.Id, LibraryCategory.Document, folderB.Id);
        var picture = Item(a.Id, LibraryCategory.Picture, null); var video = Item(a.Id, LibraryCategory.Video, null);
        db.AddRange(itemA, itemB, picture, video);
        var asset = Asset(itemA.Id, a.Id);
        var pictureAsset = Asset(picture.Id, a.Id); pictureAsset.Category = LibraryCategory.Picture;
        db.AddRange(asset, Asset(itemB.Id, b.Id), pictureAsset);
        db.Add(new LibraryDocument { UserId = a.Id, ItemId = itemA.Id });
        var collectionA = new LibraryCollection { UserId = a.Id, Name = "Mixed" }; var collectionB = new LibraryCollection { UserId = b.Id, Name = "Mixed" };
        db.AddRange(collectionA, collectionB);
        await db.SaveChangesAsync(Ct);
        return new(a.Id, b.Id, folderA.Id, folderB.Id, itemA.Id, itemB.Id, picture.Id, video.Id, collectionA.Id, collectionB.Id, asset.Id);
    }

    private static LibraryItem Item(Guid owner, LibraryCategory category, Guid? folder) => new() { UserId = owner, Category = category, FolderId = folder, Name = "Saved item", CreatedAt = Now, UpdatedAt = Now };
    private static LibraryAsset Asset(Guid item, Guid owner) => new() { ItemId = item, UserId = owner, Category = LibraryCategory.Document, OriginalFileName = "document.txt", CreatedAt = Now, UpdatedAt = Now };
    private static string Key(bool available) => $"library/{(available ? "available" : "quarantine")}/{Guid.NewGuid():N}";
    private static void MakeAvailable(LibraryAsset asset)
    {
        asset.SizeBytes = 16; asset.StoredBytes = 16; asset.ContentType = "text/plain"; asset.Checksum = new string('a', 64);
        asset.OriginalStorageKey = Key(true); asset.VerifiedAt = Now; asset.ScannedAt = Now;
        asset.ScanVerdict = LibraryScanVerdict.Clean; asset.ProcessingStatus = LibraryProcessingStatus.Available;
    }
    private static StorageReservation Upload(Guid owner) => new() { UserId = owner, ClientUploadId = Guid.NewGuid(), RequestFingerprint = new string('a', 64),
        Category = LibraryCategory.Document, FileName = "document.txt", DeclaredContentType = "text/plain", DeclaredSizeBytes = 16, DeclaredChecksum = new string('a', 64),
        ReservedBytes = 16, CreatedAt = Now, UpdatedAt = Now, ExpiresAt = Now.AddMinutes(15) };
}
