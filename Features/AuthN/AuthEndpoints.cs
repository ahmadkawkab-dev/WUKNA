namespace Lapis.Features.Auth;

using System.IdentityModel.Tokens.Jwt;
using Lapis.Features.Auth.DTOs;
using Microsoft.AspNetCore.Antiforgery;

public static class AuthEndpoints
{
    private const string RefreshCookieName = "lapis.refresh";
    private const string RefreshCookiePath = "/api/auth";

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

            var (session, errors) = await service.RegisterAsync(request, cancellationToken);
            if (session is null)
                return Results.BadRequest(new { errors });

            SetRefreshCookie(context, session);
            return Results.Ok(session.Response);
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

            var session = await service.LoginAsync(request, cancellationToken);
            if (session is null)
                return Results.Unauthorized();

            SetRefreshCookie(context, session);
            return Results.Ok(session.Response);
        });

        group.MapPost("/refresh", async (
            HttpContext context,
            IAntiforgery antiforgery,
            AuthService service,
            CancellationToken cancellationToken) =>
        {
            if (!await antiforgery.IsRequestValidAsync(context))
                return Results.BadRequest(new { error = "Invalid CSRF token." });

            var session = await service.RefreshAsync(
                context.Request.Cookies[RefreshCookieName], cancellationToken);
            if (session is null)
            {
                DeleteRefreshCookie(context);
                return Results.Unauthorized();
            }

            SetRefreshCookie(context, session);
            return Results.Ok(session.Response);
        });

        group.MapPost("/logout", async (
            HttpContext context,
            IAntiforgery antiforgery,
            AuthService service,
            CancellationToken cancellationToken) =>
        {
            if (!await antiforgery.IsRequestValidAsync(context))
                return Results.BadRequest(new { error = "Invalid CSRF token." });

            await service.LogoutAsync(context.Request.Cookies[RefreshCookieName], cancellationToken);
            DeleteRefreshCookie(context);
            return Results.NoContent();
        });

        group.MapPost("/logout-everywhere", async (
            HttpContext context,
            AuthService service,
            CancellationToken cancellationToken) =>
        {
            var subject = context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
            if (!Guid.TryParse(subject, out var userId))
                return Results.Unauthorized();

            await service.LogoutEverywhereAsync(userId, cancellationToken);
            DeleteRefreshCookie(context);
            return Results.NoContent();
        }).RequireAuthorization();

        return endpoints;
    }

    private static void SetRefreshCookie(HttpContext context, AuthSession session)
    {
        var options = RefreshCookieOptions(context);
        options.Expires = session.RefreshExpiresAt;
        context.Response.Cookies.Append(RefreshCookieName, session.RefreshToken, options);
    }

    private static void DeleteRefreshCookie(HttpContext context) =>
        context.Response.Cookies.Delete(RefreshCookieName, RefreshCookieOptions(context));

    private static CookieOptions RefreshCookieOptions(HttpContext context) => new()
    {
        HttpOnly = true,
        Secure = !context.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        Path = RefreshCookiePath
    };
}
