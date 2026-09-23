namespace Wukna.Features.Profile;

using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;

public interface IProfileImageStore
{
    string RootPath { get; }
    Task SaveAsync(string key, Stream content, CancellationToken cancellationToken);
    Task DeleteAsync(string key, CancellationToken cancellationToken);
    IReadOnlyList<(string Key, DateTimeOffset ModifiedAt)> List();
    Task CleanupTemporaryFilesAsync(DateTimeOffset olderThan, CancellationToken cancellationToken);
}

public sealed class FileProfileImageStore(IConfiguration configuration, IHostEnvironment environment)
    : IProfileImageStore
{
    public string RootPath { get; } = Path.GetFullPath(configuration["ProfileImages:Directory"] ??
        Path.Combine(environment.ContentRootPath, "App_Data", "profile-images"));

    public async Task SaveAsync(string key, Stream content, CancellationToken cancellationToken)
    {
        ValidateKey(key);
        Directory.CreateDirectory(RootPath);
        var finalPath = Path.Combine(RootPath, key);
        var tempPath = Path.Combine(RootPath, $".{Guid.NewGuid():N}.tmp");
        try
        {
            await using (var output = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write,
                FileShare.None, 81920, FileOptions.Asynchronous | FileOptions.WriteThrough))
                await content.CopyToAsync(output, cancellationToken);
            File.Move(tempPath, finalPath, overwrite: false);
        }
        finally
        {
            if (File.Exists(tempPath)) File.Delete(tempPath);
        }
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ValidateKey(key);
        var path = Path.Combine(RootPath, key);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    public IReadOnlyList<(string Key, DateTimeOffset ModifiedAt)> List()
    {
        if (!Directory.Exists(RootPath)) return [];
        return Directory.EnumerateFiles(RootPath, "*.webp", SearchOption.TopDirectoryOnly)
            .Where(path => Regex.IsMatch(Path.GetFileName(path), "^[a-f0-9]{32}\\.webp$", RegexOptions.CultureInvariant))
            .Select(path => (Path.GetFileName(path), new DateTimeOffset(File.GetLastWriteTimeUtc(path), TimeSpan.Zero)))
            .ToArray();
    }

    public Task CleanupTemporaryFilesAsync(DateTimeOffset olderThan, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!Directory.Exists(RootPath)) return Task.CompletedTask;
        foreach (var path in Directory.EnumerateFiles(RootPath, ".*.tmp", SearchOption.TopDirectoryOnly))
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!Regex.IsMatch(Path.GetFileName(path), "^\\.[a-f0-9]{32}\\.tmp$", RegexOptions.CultureInvariant)) continue;
            if (new DateTimeOffset(File.GetLastWriteTimeUtc(path), TimeSpan.Zero) < olderThan)
                File.Delete(path);
        }
        return Task.CompletedTask;
    }

    public static void ValidateKey(string key)
    {
        if (!Regex.IsMatch(key, "^[a-f0-9]{32}\\.webp$", RegexOptions.CultureInvariant))
            throw new ArgumentException("Invalid image key.", nameof(key));
    }
}

public sealed class ProfileImageCleanupService(
    IServiceScopeFactory scopeFactory,
    IProfileImageStore store,
    ILogger<ProfileImageCleanupService> logger,
    TimeProvider timeProvider) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1), timeProvider);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
                await CleanupAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception)
            {
                logger.LogError(exception, "Profile image orphan cleanup failed.");
            }
        }
    }

    private async Task CleanupAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Wukna.Shared.Data.AppDbContext.WuknaDbContext>();
        var cutoff = timeProvider.GetUtcNow().AddHours(-24);
        await store.CleanupTemporaryFilesAsync(cutoff, cancellationToken);
        var candidates = store.List().Where(file => file.ModifiedAt < cutoff).ToArray();
        if (candidates.Length == 0) return;
        var keys = candidates.Select(file => file.Key).ToArray();
        var used = await db.Users.AsNoTracking().Where(user => user.ProfileImageKey != null && keys.Contains(user.ProfileImageKey))
            .Select(user => user.ProfileImageKey!).ToListAsync(cancellationToken);
        var usedSet = used.ToHashSet(StringComparer.Ordinal);
        foreach (var file in candidates.Where(file => !usedSet.Contains(file.Key)))
            await store.DeleteAsync(file.Key, cancellationToken);
    }
}

public static class ProfileImageStaticFiles
{
    public static StaticFileOptions Options(IProfileImageStore store)
    {
        Directory.CreateDirectory(store.RootPath);
        return new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(store.RootPath),
            RequestPath = "/api/profile/images",
            ContentTypeProvider = new FileExtensionContentTypeProvider(),
            OnPrepareResponse = context =>
            {
                context.Context.Response.Headers.CacheControl = "public,max-age=31536000,immutable";
                context.Context.Response.Headers.XContentTypeOptions = "nosniff";
            }
        };
    }
}
