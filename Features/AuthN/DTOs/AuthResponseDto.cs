namespace Lapis.Features.Auth.DTOs;

public sealed record AuthResponseDto(string AccessToken, DateTimeOffset ExpiresAt, UserSummaryDto User);
