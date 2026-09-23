namespace Wukna.IntegrationTests;

using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

public sealed class CommandCounterInterceptor : DbCommandInterceptor
{
    private int count;
    private readonly List<string> commands = [];
    public int Count => count;
    public IReadOnlyList<string> Commands => commands;

    private void Increment(DbCommand command)
    {
        Interlocked.Increment(ref count);
        lock (commands) commands.Add(command.CommandText);
    }

    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result)
    {
        Increment(command);
        return result;
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        Increment(command);
        return ValueTask.FromResult(result);
    }
}
