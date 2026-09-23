namespace Lapis.Features.Realtime;

using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.SignalR;

/// <summary>Maps Wukna's JWT subject claim to SignalR's multi-connection user routing.</summary>
public sealed class SubjectUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection)
    {
        var subject = connection.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        return Guid.TryParse(subject, out var userId) ? userId.ToString("D") : null;
    }
}
