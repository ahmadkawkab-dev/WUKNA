namespace Wukna.Features.Auth.DTOs;

public sealed record UserSummaryDto(
    Guid Id,
    string Email,
    string Username,
    string? DisplayName,
    string? ProfileImageUrl,
    string? ProfileImageVersion);
