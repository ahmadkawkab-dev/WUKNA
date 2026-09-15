namespace Lapis.Features.Auth;

using System.IdentityModel.Tokens.Jwt;
using Lapis.Features.Auth.DTOs;
using Microsoft.AspNetCore.Antiforgery;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/auth");
        group.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            return await next(context);
        });

        group.MapGet("/csrf", (HttpContext context, IAntiforgery antiforgery) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(context);
            return Results.Ok(new { token = tokens.RequestToken });
        });

        group.MapPost("/register", async (
            RegisterRequestDto request,
            HttpContext context,
            IAntiforgery antiforgery,
            AuthService service,
            CancellationToken cancellationToken) =>
        {
            if (!await antiforgery.IsRequestValidAsync(context))
                return Results.BadRequest(new { error = "Invalid CSRF token." });
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
                return Results.BadRequest(new { error = "Email and password are required." });

            var (response, errors) = await service.RegisterAsync(
                request, context.Response, cancellationToken);
            if (response is null)
                return Results.BadRequest(new { errors });

            return Results.Ok(response);
        });

        group.MapPost("/login", async (
            LoginRequestDto request,
            HttpContext context,
            IAntiforgery antiforgery,
            AuthService service,
            CancellationToken cancellationToken) =>
        {
            if (!await antiforgery.IsRequestValidAsync(context))
                return Results.BadRequest(new { error = "Invalid CSRF token." });
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
                return Results.Unauthorized();

            var response = await service.LoginAsync(request, context.Response, cancellationToken);
            if (response is null)
                return Results.Unauthorized();

            return Results.Ok(response);
        });

        group.MapPost("/refresh", async (
            HttpContext context,
            IAntiforgery antiforgery,
            AuthService service,
            SessionIssuer sessionIssuer,
            CancellationToken cancellationToken) =>
        {
            if (!await antiforgery.IsRequestValidAsync(context))
                return Results.BadRequest(new { error = "Invalid CSRF token." });

            var response = await service.RefreshAsync(
                context.Request.Cookies[SessionIssuer.RefreshCookieName],
                context.Response,
                cancellationToken);
            if (response is null)
            {
                sessionIssuer.DeleteRefreshCookie(context.Response);
                return Results.Unauthorized();
            }

            return Results.Ok(response);
        });

        group.MapPost("/logout", async (
            HttpContext context,
            IAntiforgery antiforgery,
            AuthService service,
            SessionIssuer sessionIssuer,
            CancellationToken cancellationToken) =>
        {
            if (!await antiforgery.IsRequestValidAsync(context))
                return Results.BadRequest(new { error = "Invalid CSRF token." });

            await service.LogoutAsync(
                context.Request.Cookies[SessionIssuer.RefreshCookieName], cancellationToken);
            sessionIssuer.DeleteRefreshCookie(context.Response);
            return Results.NoContent();
        });

        group.MapPost("/logout-everywhere", async (
            HttpContext context,
            AuthService service,
            SessionIssuer sessionIssuer,
            CancellationToken cancellationToken) =>
        {
            var subject = context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
            if (!Guid.TryParse(subject, out var userId))
                return Results.Unauthorized();

            await service.LogoutEverywhereAsync(userId, cancellationToken);
            sessionIssuer.DeleteRefreshCookie(context.Response);
            return Results.NoContent();
        }).RequireAuthorization();

        return endpoints;
    }
}
