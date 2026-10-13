namespace Wukna.IntegrationTests;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Wukna.Features.Chat;
using Wukna.Features.Notes;
using Wukna.Features.Tasks;
using Wukna.Features.Users;
using Xunit;

public sealed class LibraryReleaseSqlTests(PostgresFixture postgres)
{
    private const string Baseline = "20261004180751_AddUserOnboarding";
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    private static Task<string> Script() => File.ReadAllTextAsync(
        Path.Combine(AppContext.BaseDirectory, "release/library-release.sql"), Ct);

    private async Task ExecuteScript(string sql)
    {
        await using var connection = new NpgsqlConnection(postgres.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(Ct);
    }

    [Theory]
    [InlineData(Baseline)]
    [InlineData("20261009181230_AddBoardCardAppearance")]
    [InlineData("20261011134920_AddLibraryVideoMetadata")]
    public async Task Reviewed_sql_preserves_existing_data_and_replays(string startingMigration)
    {
        await using var db = postgres.CreateContext();
        await db.Database.EnsureDeletedAsync(Ct);
        await db.Database.GetService<IMigrator>().MigrateAsync(startingMigration, Ct);
        var user = new User { DisplayName = "Preserved profile", ProfileImageKey = "existing.webp" };
        db.Add(user);
        await db.SaveChangesAsync(Ct);
        var boardId = Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO boards (id, title, created_at, updated_at)
            VALUES ({boardId}, 'Existing board', now(), now())
            """, Ct);
        db.Add(new Note { BoardId = boardId, Title = "Existing note", Content = "Saved content", PositionX = 10, PositionY = 20 });
        db.Add(new PersonalTask { UserId = user.Id, Title = "Existing task" });
        db.Add(new ChatMessage { BoardId = boardId, SenderUserId = user.Id, Sequence = 1,
            Body = "Existing chat", ClientMessageId = Guid.NewGuid(), RequestFingerprint = new string('a', 64) });
        await db.SaveChangesAsync(Ct);
        // PostgreSQL serializes every pre-existing domain row, including credentials and timestamps.
        const string fingerprintSql = """
            SELECT string_agg(rows::text, '|' ORDER BY rows::text) AS "Value" FROM (
                SELECT jsonb_build_array('user', to_jsonb(u)) AS rows FROM asp_net_users u
                UNION ALL SELECT jsonb_build_array('board', to_jsonb(b) - 'card_color' - 'card_color_version') FROM boards b
                UNION ALL SELECT jsonb_build_array('note', to_jsonb(n)) FROM notes n
                UNION ALL SELECT jsonb_build_array('task', to_jsonb(t)) FROM personal_tasks t
                UNION ALL SELECT jsonb_build_array('chat', to_jsonb(c)) FROM chat_messages c
            ) existing_rows
            """;
        var before = await db.Database.SqlQueryRaw<string>(fingerprintSql).SingleAsync(Ct);
        var script = await Script();
        await ExecuteScript(script);
        await ExecuteScript(script);
        Assert.Equal(before, await db.Database.SqlQueryRaw<string>(fingerprintSql).SingleAsync(Ct));
        Assert.Equal(db.Database.GetMigrations(), await db.Database.GetAppliedMigrationsAsync(Ct));
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Empty(await db.LibraryItems.ToArrayAsync(Ct));
        // Omit quota_bytes to test the actual SQL default, rather than the CLR default.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO storage_entitlements (user_id, source) VALUES ({user.Id}, 0)
            """, Ct);
        Assert.Equal(1_000_000_000, (await db.StorageEntitlements.SingleAsync(Ct)).QuotaBytes);
    }

    [Theory]
    [InlineData("older")]
    [InlineData("unknown")]
    [InlineData("gap")]
    public async Task Reviewed_sql_rejects_unexpected_history_before_changing_schema(string history)
    {
        await using var db = postgres.CreateContext();
        await db.Database.EnsureDeletedAsync(Ct);
        await db.Database.GetService<IMigrator>().MigrateAsync(
            history == "older" ? "20261004004046_AddNotificationDelivery" : Baseline, Ct);
        if (history == "unknown")
            await db.Database.ExecuteSqlRawAsync("INSERT INTO \"__EFMigrationsHistory\" VALUES ('20990101000000_Unknown', '10.0.12');", Ct);
        if (history == "gap")
            await db.Database.ExecuteSqlRawAsync("INSERT INTO \"__EFMigrationsHistory\" VALUES ('20261011134920_AddLibraryVideoMetadata', '10.0.12');", Ct);
        var before = (await db.Database.GetAppliedMigrationsAsync(Ct)).ToArray();
        await using (var connection = new NpgsqlConnection(postgres.ConnectionString))
        {
            await connection.OpenAsync(Ct);
            await using var command = new NpgsqlCommand(await Script(), connection);
            var error = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync(Ct));
            Assert.Contains("Unexpected Wukna migration history", error.MessageText);
            await using var rollback = new NpgsqlCommand("ROLLBACK", connection);
            await rollback.ExecuteNonQueryAsync(Ct);
        }
        Assert.Equal(before, await db.Database.GetAppliedMigrationsAsync(Ct));
        Assert.Null(await db.Database.SqlQueryRaw<string?>("SELECT to_regclass('library_items')::text AS \"Value\"").SingleAsync(Ct));
    }

    [Fact]
    public async Task Failure_in_a_later_migration_rolls_back_the_whole_release()
    {
        await using var db = postgres.CreateContext();
        await db.Database.EnsureDeletedAsync(Ct);
        await db.Database.GetService<IMigrator>().MigrateAsync(Baseline, Ct);
        var script = (await Script()).Replace("ALTER TABLE library_videos ADD provider_title", "ALTER TABLE deliberately_missing ADD provider_title", StringComparison.Ordinal);
        Assert.Contains("deliberately_missing", script);
        await using (var connection = new NpgsqlConnection(postgres.ConnectionString))
        {
            await connection.OpenAsync(Ct);
            await using var command = new NpgsqlCommand(script, connection);
            await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync(Ct));
            await using var rollback = new NpgsqlCommand("ROLLBACK", connection);
            await rollback.ExecuteNonQueryAsync(Ct);
        }
        Assert.Equal(16, (await db.Database.GetAppliedMigrationsAsync(Ct)).Count());
        Assert.Null(await db.Database.SqlQueryRaw<string?>("SELECT to_regclass('library_items')::text AS \"Value\"").SingleAsync(Ct));
        Assert.False(await db.Database.SqlQueryRaw<bool>("""
            SELECT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'boards' AND column_name = 'card_color') AS "Value"
            """).SingleAsync(Ct));
    }
}
