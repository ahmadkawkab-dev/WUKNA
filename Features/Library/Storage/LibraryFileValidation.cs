namespace Wukna.Features.Library;

using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Extensions.Options;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Memory;
using SixLabors.ImageSharp.Processing;

public sealed record LibraryVerifiedFile(string ContentType, byte[]? Thumbnail = null,
    int? Width = null, int? Height = null, LibraryDocumentKind Kind = LibraryDocumentKind.Unavailable,
    string? Language = null, string? Source = null);

public sealed class LibraryFileValidation(IOptions<LibraryOptions> limits)
{
    private static readonly IReadOnlyDictionary<string, string> Languages = new Dictionary<string, string>
    {
        [".cs"] = "csharp", [".ts"] = "typescript", [".tsx"] = "tsx", [".js"] = "javascript",
        [".jsx"] = "jsx", [".mjs"] = "javascript", [".cjs"] = "javascript", [".css"] = "css",
        [".html"] = "html", [".htm"] = "html", [".py"] = "python", [".sql"] = "sql",
        [".json"] = "json", [".sh"] = "bash", [".bash"] = "bash", [".txt"] = "plaintext",
    };
    public async Task<LibraryVerifiedFile> Verify(StorageReservation session, Stream content, CancellationToken ct)
    {
        var extension = Path.GetExtension(session.FileName).ToLowerInvariant();
        content.Position = 0;
        try
        {
            if (session.Category == LibraryCategory.Picture)
            {
                var config = Configuration.Default.Clone(); config.MaxDegreeOfParallelism = 2;
                config.MemoryAllocator = MemoryAllocator.Create(new MemoryAllocatorOptions { AllocationLimitMegabytes = 128, MaximumPoolSizeMegabytes = 32 });
                var decoder = new DecoderOptions { Configuration = config, MaxFrames = 1 };
                var info = await Image.IdentifyAsync(decoder, content, ct);
                var expected = extension switch { ".jpg" or ".jpeg" => "JPEG", ".png" => "PNG", ".webp" => "Webp", _ => "" };
                LibraryAccess.Require(info is not null && info.Metadata.DecodedImageFormat?.Name == expected,
                    LibraryErrors.FileType, 415);
                LibraryAccess.Require(info!.Width > 0 && info.Height > 0 && info.Width <= 8192 && info.Height <= 8192 &&
                    (long)info.Width * info.Height <= 16_000_000, LibraryErrors.FileType, 415);
                content.Position = 0; using var image = await Image.LoadAsync(decoder, content, ct);
                image.Mutate(p => p.AutoOrient());
                if (image.Width > 480 || image.Height > 480)
                    image.Mutate(p => p.Resize(new ResizeOptions { Mode = ResizeMode.Max, Size = new Size(480, 480) }));
                image.Metadata.ExifProfile = null; image.Metadata.IccProfile = null;
                image.Metadata.XmpProfile = null; image.Metadata.IptcProfile = null;
                using var output = new LimitedThumbnailStream();
                await image.SaveAsync(output, new PngEncoder { SkipMetadata = true }, ct);
                return new(session.DeclaredContentType, output.ToArray(), info.Width, info.Height);
            }
            if (Languages.TryGetValue(extension, out var language) || extension == ".md")
            {
                LibraryAccess.Require(content.Length <= limits.Value.MaxTextBytes, LibraryErrors.FileTooLarge, 413);
                using var reader = new StreamReader(content, new UTF8Encoding(false, true), detectEncodingFromByteOrderMarks: false, leaveOpen: true);
                var source = await reader.ReadToEndAsync(ct);
                LibraryAccess.Require(!source.Any(c => c is < ' ' and not '\r' and not '\n' and not '\t'), LibraryErrors.FileType, 415);
                // Source is escaped by the code/text viewer, never rendered as uploaded HTML.
                return new("text/plain", Kind: extension == ".md" ? LibraryDocumentKind.Text : LibraryDocumentKind.Code,
                    Language: extension == ".md" ? null : language, Source: source.TrimStart('\uFEFF'));
            }
            if (extension == ".pdf")
            {
                var header = new byte[8]; await content.ReadExactlyAsync(header, ct);
                LibraryAccess.Require(header.AsSpan(0, 5).SequenceEqual("%PDF-"u8) &&
                    (header[5] == '1' && header[6] == '.' && header[7] is >= (byte)'0' and <= (byte)'7' ||
                     header.AsSpan(5, 3).SequenceEqual("2.0"u8)), LibraryErrors.FileType, 415);
                content.Position = Math.Max(0, content.Length - 2048);
                using var reader = new StreamReader(content, Encoding.Latin1, leaveOpen: true);
                var tail = await reader.ReadToEndAsync(ct);
                var pointer = Regex.Match(tail, @"startxref\s+([0-9]{1,10})\s+%%EOF\s*$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(50));
                LibraryAccess.Require(pointer.Success && long.TryParse(pointer.Groups[1].Value, out var offset) &&
                    offset >= 8 && offset < content.Length - 8, LibraryErrors.FileType, 415);
                content.Position = long.Parse(pointer.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);
                var crossReference = new byte[(int)Math.Min(8192, content.Length - content.Position)];
                await content.ReadExactlyAsync(crossReference, ct); var xref = Encoding.Latin1.GetString(crossReference).TrimStart();
                LibraryAccess.Require(xref.StartsWith("xref", StringComparison.Ordinal) ||
                    Regex.IsMatch(xref, @"^\d+\s+\d+\s+obj\b", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(50)) &&
                    Regex.IsMatch(xref, @"/Type\s*/XRef\b", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(50)), LibraryErrors.FileType, 415);
                return new("application/pdf", Kind: LibraryDocumentKind.Pdf);
            }
            if (extension is ".docx" or ".xlsx")
            {
                VerifyOffice(content, extension); return new(session.DeclaredContentType);
            }
            throw new LibraryFailure(LibraryErrors.FileType, 415);
        }
        catch (Exception error) when (error is UnknownImageFormatException or InvalidImageContentException or
            InvalidMemoryOperationException or DecoderFallbackException or InvalidDataException or EndOfStreamException or XmlException)
        { throw new LibraryFailure(LibraryErrors.FileType, 415); }
        finally { content.Position = 0; }
    }
    private static void VerifyOffice(Stream stream, string extension)
    {
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true);
        LibraryAccess.Require(archive.Entries.Count is > 0 and <= 1000, LibraryErrors.FileType, 415);
        long expanded = 0; var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in archive.Entries)
        {
            var path = entry.FullName;
            LibraryAccess.Require(seen.Add(path) && !path.StartsWith('/') && !path.Contains('\\') &&
                !path.Split('/').Any(segment => segment is ".." or ".") && !path.Contains(':') &&
                !path.Any(char.IsControl) && !path.Contains("vba", StringComparison.OrdinalIgnoreCase) &&
                !path.Contains("embeddings", StringComparison.OrdinalIgnoreCase), LibraryErrors.FileType, 415);
            expanded = checked(expanded + entry.Length);
            LibraryAccess.Require(expanded <= 100_000_000 && entry.Length <= 20_000_000 &&
                entry.Length <= Math.Max(1, entry.CompressedLength) * 100, LibraryErrors.FileType, 415);
            // Fully consume bounded entries to detect malformed archives, without extracting paths.
            using var input = entry.Open(); var buffer = new byte[65536]; long read = 0; int count;
            while ((count = input.Read(buffer)) != 0) { read += count; LibraryAccess.Require(read <= entry.Length, LibraryErrors.FileType, 415); }
            LibraryAccess.Require(read == entry.Length, LibraryErrors.FileType, 415);
        }
        var main = extension == ".docx" ? "word/document.xml" : "xl/workbook.xml";
        var expected = extension == ".docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" :
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
        XDocument Parse(string name)
        {
            var entry = archive.GetEntry(name); LibraryAccess.Require(entry is not null && entry.Length <= 2_000_000, LibraryErrors.FileType, 415);
            using var input = entry!.Open(); using var reader = XmlReader.Create(input, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 2_000_000 });
            return XDocument.Load(reader);
        }
        var types = Parse("[Content_Types].xml"); var document = Parse(main); Parse("_rels/.rels");
        LibraryAccess.Require(!types.Descendants().Attributes("ContentType").Any(attribute =>
            new[] { "macro", "vba", "oleobject", "activex" }.Any(kind =>
                attribute.Value.Contains(kind, StringComparison.OrdinalIgnoreCase))), LibraryErrors.FileType, 415);
        LibraryAccess.Require(types.Root?.Name == XName.Get("Types", "http://schemas.openxmlformats.org/package/2006/content-types") &&
            types.Descendants().Any(e => (string?)e.Attribute("PartName") == "/" + main && (string?)e.Attribute("ContentType") == expected) &&
            document.Root?.Name == (extension == ".docx" ? XName.Get("document", "http://schemas.openxmlformats.org/wordprocessingml/2006/main") :
                XName.Get("workbook", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")), LibraryErrors.FileType, 415);
    }
    private sealed class LimitedThumbnailStream : MemoryStream
    {
        public override void Write(ReadOnlySpan<byte> buffer)
        { LibraryAccess.Require(Position + buffer.Length <= LibraryReservations.ThumbnailBudgetBytes, LibraryErrors.FileTooLarge, 413); base.Write(buffer); }
        public override void Write(byte[] buffer, int offset, int count)
        { LibraryAccess.Require(Position + count <= LibraryReservations.ThumbnailBudgetBytes, LibraryErrors.FileTooLarge, 413); base.Write(buffer, offset, count); }
        public override void WriteByte(byte value)
        { LibraryAccess.Require(Position + 1 <= LibraryReservations.ThumbnailBudgetBytes, LibraryErrors.FileTooLarge, 413); base.WriteByte(value); }
        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken ct = default)
        { ct.ThrowIfCancellationRequested(); Write(buffer.Span); return ValueTask.CompletedTask; }
        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken ct)
        { ct.ThrowIfCancellationRequested(); Write(buffer, offset, count); return Task.CompletedTask; }
    }
}
