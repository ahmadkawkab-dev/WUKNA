namespace Wukna.Features.Library;

using System.Text.Json;
using System.Text.Json.Serialization;

public sealed record LibraryPageDto<T>(IReadOnlyList<T> Items, string? NextCursor);
public sealed record LibraryFolderDto(Guid Id, string Name, string Category, Guid? ParentId, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record LibraryCollectionDto(Guid Id, string Name, string? Description, int ItemCount, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record LibraryCollectionItemDto(Guid CollectionId, Guid ItemId, DateTimeOffset AddedAt);
public sealed record LibraryStorageSummaryDto(long QuotaBytes, long UsedBytes, long ReservedBytes, long AvailableBytes, string EntitlementSource);
public sealed record LibraryCategorySummaryDto(string Category, int ItemCount);
public sealed record LibrarySummaryDto(IReadOnlyList<LibraryCategorySummaryDto> Categories, LibraryStorageSummaryDto Storage);

// Wire DTOs deliberately have no ownership, credentials, scan leases, storage keys or work metadata.
public record LibraryItemSummaryDto
{
    public required Guid Id { get; init; }
    public required string Category { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public Guid? FolderId { get; init; }
    public bool Favorite { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }
    public DateTimeOffset? DeletedAt { get; init; }
    public required string ProcessingStatus { get; init; }
    public long SizeBytes { get; init; }
    public string? ThumbnailReference { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DocumentKind { get; init; }
    public IReadOnlyList<string> Tags { get; init; } = [];
}

[JsonDerivedType(typeof(LibraryPictureDetailDto))]
[JsonDerivedType(typeof(LibraryDocumentDetailDto))]
[JsonDerivedType(typeof(LibraryVideoDetailDto))]
public abstract record LibraryItemDetailDto : LibraryItemSummaryDto
{
    public string? ContentReference { get; init; }
    public string Notes { get; init; } = string.Empty;
    public IReadOnlyList<LibraryFolderDto> FolderBreadcrumb { get; init; } = [];
}

// Checksum may be null while processing; the future HTTP adapter must reflect that refinement.
public sealed record LibraryAssetDto(Guid Id, string? ContentType, string OriginalFileName, long SizeBytes, string? Checksum, string ProcessingStatus);

public sealed record LibraryPictureDetailDto : LibraryItemDetailDto
{
    public required LibraryAssetDto Asset { get; init; }
    public int Width { get; init; }
    public int Height { get; init; }
    public required string Alt { get; init; }
}

public sealed record LibraryDocumentDetailDto : LibraryItemDetailDto
{
    public required LibraryAssetDto Asset { get; init; }
    public required string PreviewKind { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Text { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Language { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Source { get; init; }
}

public sealed record LibraryVideoDetailDto : LibraryItemDetailDto
{
    public required string Provider { get; init; }
    public string? VideoId { get; init; }
    public required string Url { get; init; }
    public string? Creator { get; init; }
    public string? MetadataTitle { get; init; }
    public string? MetadataErrorCode { get; init; }
}

public sealed record LibraryUploadSessionDto(Guid Id, long ReservedBytes, DateTimeOffset ExpiresAt,
    string State, Guid? ItemId, string? ProcessingStatus, string? ErrorCode = null,
    bool CancellationRequested = false, bool ResultPurged = false);
public sealed record LibraryCapabilitiesDto(bool StorageAvailable, bool CheckoutEnabled);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record LibraryFolderWriteRequest(string? Name, string? Category, Guid? ParentId);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record LibraryCollectionWriteRequest(string? Name, string? Description);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record LibraryVideoWriteRequest(string? Name, string? Description, Guid? FolderId, string? Url);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record LibraryItemIdsRequest(Guid[]? Ids);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record LibraryMembershipRequest(Guid[]? ItemIds);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record LibraryBulkUpdateRequest(Guid[]? Ids, LibraryItemUpdateRequest? Update);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record LibraryUploadCreateRequest(Guid ClientUploadId, string? Category, string? FileName,
    string? ContentType, long SizeBytes, string? Checksum, Guid? FolderId);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record LibraryUploadFinalizeRequest(Guid ClientUploadId, string? Checksum);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record LibraryItemUpdateRequest
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public LibraryOptional<string?> Name { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public LibraryOptional<string?> Description { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public LibraryOptional<Guid?> FolderId { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public LibraryOptional<bool?> Favorite { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public LibraryOptional<string[]?> Tags { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public LibraryOptional<string?> Notes { get; init; }
}

// Omitted fields preserve values; explicit null is visible to validation and can clear nullable fields.
[JsonConverter(typeof(LibraryOptionalJsonConverterFactory))]
public readonly record struct LibraryOptional<T>(bool IsSpecified, T? Value);

public sealed class LibraryOptionalJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) => typeToConvert.IsGenericType &&
        typeToConvert.GetGenericTypeDefinition() == typeof(LibraryOptional<>);

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options) =>
        (JsonConverter)Activator.CreateInstance(typeof(Converter<>).MakeGenericType(typeToConvert.GetGenericArguments()))!;

    private sealed class Converter<T> : JsonConverter<LibraryOptional<T>>
    {
        public Converter() { }
        public override bool HandleNull => true;
        public override LibraryOptional<T> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            new(true, JsonSerializer.Deserialize<T>(ref reader, options));
        public override void Write(Utf8JsonWriter writer, LibraryOptional<T> value, JsonSerializerOptions options) =>
            JsonSerializer.Serialize(writer, value.Value, options);
    }
}
