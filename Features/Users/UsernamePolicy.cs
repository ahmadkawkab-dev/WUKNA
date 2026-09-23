namespace Lapis.Features.Users;

using System.Text.RegularExpressions;

public static partial class UsernamePolicy
{
    public const int MinimumLength = 3;
    public const int MaximumLength = 30;

    public static string Normalize(string username) => username.Trim().ToUpperInvariant();

    public static bool IsValid(string username) =>
        username.Length is >= MinimumLength and <= MaximumLength &&
        Allowed().IsMatch(username);

    public static string FromEmail(string email, Guid userId)
    {
        var localPart = email.Split('@', 2)[0].ToLowerInvariant();
        var safe = InvalidCharacters().Replace(localPart, "").Trim('.', '_', '-');
        if (safe.Length < MinimumLength) safe = "user";
        safe = safe[..Math.Min(safe.Length, MaximumLength - 7)];
        return $"{safe}-{userId:N}"[..Math.Min(safe.Length + 7, MaximumLength)];
    }

    [GeneratedRegex("^[a-zA-Z0-9._-]+$", RegexOptions.CultureInvariant)]
    private static partial Regex Allowed();

    [GeneratedRegex("[^a-z0-9._-]", RegexOptions.CultureInvariant)]
    private static partial Regex InvalidCharacters();
}

public static class ProfileImageUrls
{
    public static string? For(string? key, string? version) =>
        key is null ? null : $"/api/profile/images/{key}?v={Uri.EscapeDataString(version ?? "")}";
}
