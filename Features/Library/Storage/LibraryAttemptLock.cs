namespace Wukna.Features.Library;

using System.Buffers.Binary;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Wukna.Shared.Data.AppDbContext;

// Session advisory lock coordinates active uploads and recovery across API replicas.
// Dedicated nonpooled connection cannot accidentally return a held lock to the pool.
public sealed class LibraryAttemptLock : IAsyncDisposable
{
    private readonly NpgsqlConnection connection;
    private LibraryAttemptLock(NpgsqlConnection connection) { this.connection = connection; }
    public static async Task<LibraryAttemptLock?> Try(WuknaDbContext db, Guid session, CancellationToken ct)
    {
        var key = BinaryPrimitives.ReadInt64LittleEndian(session.ToByteArray()) ^ 0x4c494252415259;
        var builder = new NpgsqlConnectionStringBuilder(db.Database.GetConnectionString()) { Pooling = false };
        var connection = new NpgsqlConnection(builder.ConnectionString);
        try
        {
            await connection.OpenAsync(ct); using var command = new NpgsqlCommand("SELECT pg_try_advisory_lock(@key)", connection);
            command.Parameters.AddWithValue("key", key);
            if ((bool)(await command.ExecuteScalarAsync(ct))!) return new(connection);
            await connection.DisposeAsync(); return null;
        }
        catch { await connection.DisposeAsync(); throw; }
    }
    public ValueTask DisposeAsync() => connection.DisposeAsync();
}
