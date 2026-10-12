namespace Wukna.Features.Library;

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

public sealed record LibraryCursor(Guid Owner, string Scope, string Sort, Guid Id, DateTimeOffset? Time,
    long? Size, string? Name, DateTimeOffset ExpiresAt, int Version = 1);

public sealed class LibraryCursorCodec(IDataProtectionProvider protection, TimeProvider clock)
{
    private readonly IDataProtector protector = protection.CreateProtector("Wukna.PersonalLibrary.Cursor.v1");
    public static string Scope(object filters) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(filters))));
    public string Encode(Guid owner, string scope, string sort, Guid id, DateTimeOffset? time = null, long? size = null, string? name = null) =>
        protector.Protect(JsonSerializer.Serialize(new LibraryCursor(owner, scope, sort, id, time, size, name, clock.GetUtcNow().AddHours(1))));
    public LibraryCursor? Decode(string? token, Guid owner, string scope, string sort)
    {
        if (token is null) return null;
        LibraryAccess.Require(token.Length is > 0 and <= 2048, LibraryErrors.InvalidCursor);
        try
        {
            var cursor = JsonSerializer.Deserialize<LibraryCursor>(protector.Unprotect(token));
            LibraryAccess.Require(cursor is not null && cursor.Version == 1 && cursor.Owner == owner && cursor.Scope == scope &&
                cursor.Sort == sort && cursor.Id != Guid.Empty && cursor.ExpiresAt > clock.GetUtcNow(), LibraryErrors.InvalidCursor);
            return cursor;
        }
        catch (Exception error) when (error is CryptographicException or JsonException or FormatException or ArgumentException)
        { throw new LibraryFailure(LibraryErrors.InvalidCursor); }
    }
}
