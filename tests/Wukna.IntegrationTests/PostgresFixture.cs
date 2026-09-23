namespace Wukna.IntegrationTests;

using Wukna.Shared.Data.AppDbContext;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Testcontainers.PostgreSql;
using Xunit;

public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer container = new PostgreSqlBuilder("postgres:17-alpine")
        .WithDatabase("wukna_tests")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    public string ConnectionString => container.GetConnectionString();

    public WuknaDbContext CreateContext(params IInterceptor[] interceptors)
    {
        var options = new DbContextOptionsBuilder<WuknaDbContext>()
            .UseNpgsql(ConnectionString)
            .UseSnakeCaseNamingConvention()
            .AddInterceptors(interceptors)
            .Options;
        return new WuknaDbContext(options);
    }

    public async Task ResetAsync(CancellationToken cancellationToken)
    {
        await using var db = CreateContext();
        await db.Database.EnsureDeletedAsync(cancellationToken);
        await db.Database.MigrateAsync(cancellationToken);
    }

    public async ValueTask InitializeAsync() => await container.StartAsync();

    public async ValueTask DisposeAsync() => await container.DisposeAsync();
}
