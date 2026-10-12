namespace Wukna.IntegrationTests;

using System.Text.Json;
using Wukna.Features.Library;
using Xunit;

public sealed class LibraryContractTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public void Patch_distinguishes_omitted_null_false_and_empty_values_and_roundtrips()
    {
        var omitted = JsonSerializer.Deserialize<LibraryItemUpdateRequest>("{}", Json)!;
        Assert.False(omitted.Description.IsSpecified); Assert.False(omitted.FolderId.IsSpecified);
        Assert.Equal("{}", JsonSerializer.Serialize(omitted, Json));
        var explicitValues = JsonSerializer.Deserialize<LibraryItemUpdateRequest>("""{"description":null,"folderId":null,"favorite":false,"tags":[],"notes":""}""", Json)!;
        Assert.True(explicitValues.Description.IsSpecified); Assert.Null(explicitValues.Description.Value);
        Assert.True(explicitValues.FolderId.IsSpecified); Assert.Null(explicitValues.FolderId.Value);
        Assert.True(explicitValues.Favorite.IsSpecified); Assert.False(explicitValues.Favorite.Value);
        Assert.Empty(explicitValues.Tags.Value!); Assert.Equal("", explicitValues.Notes.Value);
        Assert.False(explicitValues.Name.IsSpecified);
        var roundtrip = JsonSerializer.Deserialize<LibraryItemUpdateRequest>(JsonSerializer.Serialize(explicitValues, Json), Json)!;
        Assert.True(roundtrip.FolderId.IsSpecified); Assert.False(roundtrip.Favorite.Value);
    }

    [Theory]
    [InlineData("{\"userId\":\"00000000-0000-0000-0000-000000000001\"}")]
    [InlineData("{\"category\":\"video\"}")]
    [InlineData("{\"processingStatus\":\"available\"}")]
    [InlineData("{\"originalStorageKey\":\"public/file\"}")]
    public void Patch_cannot_accept_ownership_or_immutable_storage_fields(string payload) =>
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<LibraryItemUpdateRequest>(payload, Json));

    [Fact]
    public void Polymorphic_detail_keeps_frontend_discriminants_and_omits_internal_storage_data()
    {
        LibraryItemDetailDto detail = new LibraryDocumentDetailDto { Id = Guid.NewGuid(), Category = "document", Name = "example.ts",
            ProcessingStatus = "available", PreviewKind = "code", Language = "typescript", Source = "const value = 1;",
            Asset = new(Guid.NewGuid(), "text/plain", "example.ts", 16, new string('a', 64), "available") };
        using var parsed = JsonDocument.Parse(JsonSerializer.Serialize(detail, Json));
        var root = parsed.RootElement;
        Assert.Equal("document", root.GetProperty("category").GetString());
        Assert.Equal("code", root.GetProperty("previewKind").GetString());
        Assert.Equal("const value = 1;", root.GetProperty("source").GetString());
        Assert.False(root.TryGetProperty("text", out _)); Assert.False(root.TryGetProperty("userId", out _));
        Assert.False(root.TryGetProperty("$type", out _));
        Assert.DoesNotContain("storageKey", root.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("lease", root.GetRawText(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Summary_contains_no_source_original_content_or_ownership()
    {
        var summary = new LibraryItemSummaryDto { Id = Guid.NewGuid(), Category = "document", Name = "example.ts", ProcessingStatus = "pending", DocumentKind = "code" };
        using var parsed = JsonDocument.Parse(JsonSerializer.Serialize(summary, Json));
        Assert.False(parsed.RootElement.TryGetProperty("source", out _)); Assert.False(parsed.RootElement.TryGetProperty("asset", out _));
        Assert.False(parsed.RootElement.TryGetProperty("contentReference", out _)); Assert.False(parsed.RootElement.TryGetProperty("userId", out _));
    }

    [Fact]
    public void Free_configuration_has_decimal_five_gigabyte_default_and_bounded_preview_limits()
    {
        var options = new LibraryOptions(); Assert.True(options.IsValid()); Assert.Equal(1_000_000_000, options.FreeQuotaBytes);
        options.FreeQuotaBytes = 10_000_000; Assert.True(options.IsValid());
        options.FreeQuotaBytes = 1_000_000_001; Assert.False(options.IsValid());
        options.FreeQuotaBytes = 1_000_000_000;
        options.MaxTextBytes = 256001; Assert.False(options.IsValid());
        options.MaxTextBytes = 256000; options.ReservationSeconds = 0; Assert.False(options.IsValid());
        Assert.False(new LibraryCapabilitiesDto(false, false).CheckoutEnabled);
    }
}
