namespace Wukna.Features.Library;

using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using Wukna.Shared.Data.AppDbContext;
using Wukna.Features.Subscriptions;

public static class LibraryEndpoints
{
    public static IServiceCollection AddPersonalLibrary(this IServiceCollection services)
    {
        services.AddOptions<LibraryOptions>().BindConfiguration("Library").Validate(options => options.IsValid(), "Library quota, file, preview, expiry and rate limits must be valid.").ValidateOnStart();
        services.AddSingleton<LibraryCursorCodec>(); services.AddSingleton<LibraryVideoMetadataClient>();
        services.AddHostedService<LibraryReservationWorker>();
        services.AddOptions<LibraryStorageOptions>().BindConfiguration("Library:Storage")
            .Validate(options => options.IsValid(), "Library private storage/scanner configuration is invalid.").ValidateOnStart();
        services.AddSingleton<ILibraryFileStorage, SeaweedLibraryFileStorage>();
        services.AddSingleton<ILibraryScanner, LibraryClamScanner>();
        services.AddSingleton<LibraryFileValidation>(); services.AddSingleton<LibraryTransferGate>();
        services.AddHostedService<LibraryStorageWorker>();
        services.AddHttpClient("library-video-provider", client => client.Timeout = Timeout.InfiniteTimeSpan).RemoveAllLoggers()
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false, ConnectTimeout = TimeSpan.FromSeconds(3), PooledConnectionLifetime = TimeSpan.FromMinutes(5) });
        services.AddRateLimiter(options =>
        {
            foreach (var policy in new[] { "library-read", "library-write", "library-provider" })
                options.AddPolicy(policy, context => RateLimitPartition.GetFixedWindowLimiter(
                    LibraryAccess.TryOwner(context, out var owner) ? owner.ToString() : "anonymous", _ =>
                    {
                        var configured = context.RequestServices.GetRequiredService<IOptions<LibraryOptions>>().Value;
                        return new FixedWindowRateLimiterOptions { PermitLimit = policy == "library-read" ? configured.ReadRequestsPerMinute : policy == "library-write" ? configured.WriteRequestsPerMinute : configured.ProviderRequestsPerMinute,
                            Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true };
                    }));
            // Preserve Chat/Board rejection behavior while giving Library its agreed code envelope.
            var previous = options.OnRejected;
            options.OnRejected = async (rejected, ct) =>
            {
                var context = rejected.HttpContext;
                if (context.GetEndpoint()?.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName?.StartsWith("library-", StringComparison.Ordinal) != true)
                { if (previous is not null) await previous(rejected, ct); return; }
                context.Response.StatusCode = 429;
                if (rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry)) context.Response.Headers.RetryAfter = Math.Ceiling(retry.TotalSeconds).ToString(CultureInfo.InvariantCulture);
                await context.Response.WriteAsJsonAsync(new LibraryErrorDto(LibraryErrors.RateLimited), ct);
            };
        });
        return services;
    }
    public static IEndpointRouteBuilder MapLibraryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/library").RequireAuthorization();
        group.AddEndpointFilter(async (invocation, next) =>
        {
            var context = invocation.HttpContext; var db = context.RequestServices.GetRequiredService<WuknaDbContext>();
            if (!LibraryAccess.TryOwner(context, out var owner) || !await db.Users.AnyAsync(user => user.Id == owner, context.RequestAborted)) return Results.Unauthorized();
            context.Items[typeof(LibraryAccess)] = owner;
            try { return await next(invocation); }
            catch (LibraryFailure failure) { return Results.Json(new LibraryErrorDto(failure.Code), statusCode: failure.Status); }
            catch (DbUpdateException failure) when (failure.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "ix_library_folders_sibling_name" })
            { return Results.Conflict(new LibraryErrorDto(LibraryErrors.FolderNameConflict)); }
        });
        group.MapGet("/capabilities", (IOptions<LibraryStorageOptions> storage, IStorageSubscriptionProvider subscriptions) =>
            Results.Ok(new LibraryCapabilitiesDto(storage.Value.Enabled, subscriptions.CheckoutEnabled))).RequireRateLimiting("library-read");
        group.MapGet("/summary", LibraryReads.Summary).RequireRateLimiting("library-read");
        group.MapGet("/storage", LibraryReservations.StorageRead).RequireRateLimiting("library-read");
        group.MapGet("/items", LibraryReads.Items).RequireRateLimiting("library-read");
        group.MapGet("/items/{id:guid}", async (Guid id, HttpContext context, WuknaDbContext db, CancellationToken ct) =>
            Results.Ok(await LibraryReads.Detail(id, LibraryAccess.Owner(context), db, ct))).RequireRateLimiting("library-read");
        group.MapGet("/folders", LibraryOrganizationReads.Folders).RequireRateLimiting("library-read");
        group.MapGet("/folders/{id:guid}", async (Guid id, HttpContext context, WuknaDbContext db, CancellationToken ct) =>
        {
            var owner = LibraryAccess.Owner(context); var row = await db.LibraryFolders.AsNoTracking().SingleOrDefaultAsync(row => row.Id == id && row.UserId == owner, ct);
            LibraryAccess.Found(row is not null); return Results.Ok(LibraryReads.FolderDto(row!));
        }).RequireRateLimiting("library-read");
        group.MapPost("/folders", LibraryOrganizationCommands.CreateFolder).RequireRateLimiting("library-write");
        group.MapDelete("/folders/{id:guid}", LibraryOrganizationCommands.DeleteFolder).RequireRateLimiting("library-write");
        group.MapGet("/collections", LibraryOrganizationReads.Collections).RequireRateLimiting("library-read");
        group.MapGet("/collections/{id:guid}", async (Guid id, HttpContext context, WuknaDbContext db, CancellationToken ct) =>
        {
            var owner = LibraryAccess.Owner(context);
            var row = await db.LibraryCollections.AsNoTracking().Where(row => row.Id == id && row.UserId == owner)
                .Select(row => new LibraryCollectionDto(row.Id, row.Name, row.Description,
                    db.LibraryCollectionItems.Count(member => member.UserId == owner && member.CollectionId == row.Id && member.Item.DeletedAt == null), row.CreatedAt, row.UpdatedAt)).SingleOrDefaultAsync(ct);
            LibraryAccess.Found(row is not null); return Results.Ok(row);
        }).RequireRateLimiting("library-read");
        group.MapPost("/collections", LibraryOrganizationCommands.CreateCollection).RequireRateLimiting("library-write");
        group.MapPut("/collections/{id:guid}", LibraryOrganizationCommands.UpdateCollection).RequireRateLimiting("library-write");
        group.MapDelete("/collections/{id:guid}", LibraryOrganizationCommands.DeleteCollection).RequireRateLimiting("library-write");
        foreach (var action in new[] { "add", "remove" })
            group.MapPost("/collections/{id:guid}/items/" + action, (Guid id, LibraryMembershipRequest request, HttpContext context, WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct) =>
                LibraryOrganizationCommands.Membership(id, request, action == "add", context, db, options, clock, ct)).RequireRateLimiting("library-write");
        group.MapPatch("/items/{id:guid}", (Guid id, LibraryItemUpdateRequest request, HttpContext context, WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct) =>
            LibraryItemCommands.Update([id], request, context, db, options, clock, ct)).RequireRateLimiting("library-write");
        group.MapPost("/items/bulk-update", (LibraryBulkUpdateRequest request, HttpContext context, WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct) =>
            LibraryItemCommands.Update(request.Ids, request.Update, context, db, options, clock, ct)).RequireRateLimiting("library-write");
        foreach (var action in new[] { "trash", "restore", "purge" })
            group.MapPost("/items/" + action, (LibraryItemIdsRequest request, HttpContext context, WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct) =>
                LibraryItemCommands.Lifecycle(request.Ids, action, context, db, options, clock, ct)).RequireRateLimiting("library-write");
        group.MapPost("/videos", LibraryVideoCommands.Create).RequireRateLimiting("library-provider");
        group.MapPost("/uploads", LibraryReservations.Create).RequireRateLimiting("library-write");
        group.MapGet("/uploads/{id:guid}", LibraryReservations.Read).RequireRateLimiting("library-read");
        group.MapDelete("/uploads/{id:guid}", LibraryReservations.Cancel).RequireRateLimiting("library-write");
        group.MapPut("/uploads/{id:guid}/content", LibraryFileTransfers.Upload).RequireRateLimiting("library-write");
        group.MapPost("/uploads/{id:guid}/finalize", LibraryReservations.Finalize).RequireRateLimiting("library-write");
        group.MapGet("/items/{id:guid}/content", async (Guid id, HttpContext context, WuknaDbContext db,
            IOptions<LibraryStorageOptions> options, ILibraryFileStorage store, LibraryTransferGate gate, CancellationToken ct) =>
        {
            var owner = LibraryAccess.Owner(context); var row = await db.LibraryItems.AsNoTracking().SingleOrDefaultAsync(row => row.Id == id && row.UserId == owner, ct);
            LibraryAccess.Found(row is not null); LibraryAccess.Require(row!.Category != LibraryCategory.Video, LibraryErrors.FileType, 415);
            return await LibraryFileTransfers.Download(id, false, context, db, options, store, gate, ct);
        }).RequireRateLimiting("library-read");
        group.MapGet("/items/{id:guid}/thumbnail", Thumbnail).RequireRateLimiting("library-provider");
        return endpoints;
    }
    private static async Task<IResult> Thumbnail(Guid id, HttpContext context, WuknaDbContext db, LibraryVideoMetadataClient provider,
        IOptions<LibraryStorageOptions> options, ILibraryFileStorage store, LibraryTransferGate gate, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context);
        var row = await db.LibraryItems.AsNoTracking().Where(row => row.Id == id && row.UserId == owner)
            .Select(row => new { row.Category, Url = row.Video == null ? null : row.Video.ThumbnailUrl, Provider = row.Video == null ? LibraryVideoProvider.External : row.Video.Provider }).SingleOrDefaultAsync(ct);
        LibraryAccess.Found(row is not null);
        if (row!.Category != LibraryCategory.Video) return await LibraryFileTransfers.Download(id, true, context, db, options, store, gate, ct);
        LibraryAccess.Require(row.Url is not null, LibraryErrors.ProcessingUnavailable, 503);
        var response = await provider.Thumbnail(row.Url!, row.Provider, context, ct);
        LibraryAccess.Found(await db.LibraryItems.AnyAsync(row => row.Id == id && row.UserId == owner, ct)); return response;
    }
}

public sealed class LibraryRequestMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Path.StartsWithSegments("/api/library"))
        {
            context.Response.Headers.CacheControl = "no-store"; context.Response.Headers.XContentTypeOptions = "nosniff";
            var isTransfer = HttpMethods.IsPut(context.Request.Method) &&
                context.Request.Path.Value?.EndsWith("/content", StringComparison.Ordinal) == true &&
                context.Request.Path.StartsWithSegments("/api/library/uploads");
            var maximum = isTransfer ? context.RequestServices.GetRequiredService<IOptions<LibraryOptions>>().Value.MaxFileBytes : 65536;
            var size = context.Features.Get<IHttpMaxRequestBodySizeFeature>();
            if (size is { IsReadOnly: false }) size.MaxRequestBodySize = maximum;
            if (context.Request.ContentLength > maximum)
            { context.Response.StatusCode = 413; await context.Response.WriteAsJsonAsync(new LibraryErrorDto(LibraryErrors.FileTooLarge), context.RequestAborted); return; }
        }
        await next(context);
    }
}
