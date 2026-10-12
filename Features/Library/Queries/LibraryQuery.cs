namespace Wukna.Features.Library;

using System.Globalization;

public sealed class LibraryQuery(IQueryCollection query, params string[] allowed)
{
    public void Validate() => LibraryAccess.Require(query.All(pair => allowed.Contains(pair.Key) && pair.Value.Count == 1), LibraryErrors.InvalidQuery);
    public string? Text(string key, int max = 200)
    {
        if (!query.TryGetValue(key, out var values)) return null;
        var text = values[0]?.Trim();
        LibraryAccess.Require(text is not null && text.Length <= max && !text.Any(char.IsControl), LibraryErrors.InvalidQuery);
        return text;
    }
    public int Limit(int fallback = 24)
    {
        var text = Text("limit");
        if (text is null) return fallback;
        LibraryAccess.Require(int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var limit) && limit is >= 1 and <= 100, LibraryErrors.InvalidQuery);
        return limit;
    }
    public bool Flag(string key)
    {
        var text = Text(key);
        LibraryAccess.Require(text is null or "true" or "false", LibraryErrors.InvalidQuery);
        return text == "true";
    }
    public (bool Specified, Guid? Id) Reference(string key, bool root = false)
    {
        var text = Text(key);
        if (text is null) return (false, null);
        if (root && text == "root") return (true, null);
        LibraryAccess.Require(Guid.TryParse(text, out var id) && id != Guid.Empty, LibraryErrors.InvalidQuery);
        return (true, id);
    }
    public LibraryCategory? Category()
    { var text = Text("category"); return text is null ? null : LibraryAccess.Category(text); }
}
