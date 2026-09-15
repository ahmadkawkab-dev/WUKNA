namespace Lapis.Shared.Data.AppDbContext;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

public sealed class LapisDbContextFactory : IDesignTimeDbContextFactory<LapisDbContext>
{
    public LapisDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json")
            .AddEnvironmentVariables()
            .Build();
        var connectionString = configuration.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException("Configure ConnectionStrings:Postgres for EF tooling.");

        // EF tooling uses this factory instead of Program, so it needs the same naming convention.
        var options = new DbContextOptionsBuilder<LapisDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options;
        return new LapisDbContext(options);
    }
}
