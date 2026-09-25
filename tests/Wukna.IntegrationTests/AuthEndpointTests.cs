namespace Wukna.IntegrationTests;

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using Wukna.Features.Auth;
using Wukna.Features.Auth.DTOs;
using Wukna.Features.Users;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

public sealed class AuthEndpointTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Registration_issues_a_session_and_rejects_a_duplicate_email()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        await using var factory = Factory();
        using var client = Client(factory);
        var csrf = await GetCsrfAsync(client, cancellationToken);

        using var registration = PostJson("/api/auth/register",
            new RegisterRequestDto("new@wukna.test", "ValidPassword123!"), csrf.Cookie);
        registration.Headers.Add("X-CSRF-TOKEN", csrf.Token);
        using var registered = await client.SendAsync(registration, cancellationToken);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var session = await registered.Content.ReadFromJsonAsync<AuthResponseDto>(cancellationToken);
        Assert.NotNull(session);
        Assert.Equal("new@wukna.test", session.User.Email);
        Assert.False(string.IsNullOrWhiteSpace(session.AccessToken));
        Assert.StartsWith("wukna.refresh=", Cookie(registered, "wukna.refresh"));

        using var duplicate = PostJson("/api/auth/register",
            new RegisterRequestDto("NEW@wukna.test", "ValidPassword123!"), csrf.Cookie);
        duplicate.Headers.Add("X-CSRF-TOKEN", csrf.Token);
        using var rejected = await client.SendAsync(duplicate, cancellationToken);
        Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
        Assert.Equal("email_already_registered",
            (await rejected.Content.ReadFromJsonAsync<ErrorResponse>(cancellationToken))?.Error);

        await using var db = postgres.CreateContext();
        Assert.Equal(1, await db.Users.CountAsync(cancellationToken));
        Assert.Equal(1, await db.RefreshTokens.CountAsync(cancellationToken));
    }

    [Fact]
    public async Task Refresh_rotates_the_cookie_and_rejects_replay()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        await using var factory = Factory();
        using var client = Client(factory);
        var csrf = await GetCsrfAsync(client, cancellationToken);
        using var registration = PostJson("/api/auth/register",
            new RegisterRequestDto("rotate@wukna.test", "ValidPassword123!"), csrf.Cookie);
        registration.Headers.Add("X-CSRF-TOKEN", csrf.Token);
        using var registered = await client.SendAsync(registration, cancellationToken);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var firstCookie = Cookie(registered, "wukna.refresh");

        using var firstRefresh = PostJson("/api/auth/refresh", new { }, csrf.Cookie, firstCookie);
        firstRefresh.Headers.Add("X-CSRF-TOKEN", csrf.Token);
        using var refreshed = await client.SendAsync(firstRefresh, cancellationToken);
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        var secondCookie = Cookie(refreshed, "wukna.refresh");
        Assert.NotEqual(firstCookie, secondCookie);
        Assert.NotNull(await refreshed.Content.ReadFromJsonAsync<AuthResponseDto>(cancellationToken));

        using var replay = PostJson("/api/auth/refresh", new { }, csrf.Cookie, firstCookie);
        replay.Headers.Add("X-CSRF-TOKEN", csrf.Token);
        using var replayed = await client.SendAsync(replay, cancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, replayed.StatusCode);

        using var secondRefresh = PostJson("/api/auth/refresh", new { }, csrf.Cookie, secondCookie);
        secondRefresh.Headers.Add("X-CSRF-TOKEN", csrf.Token);
        using var renewed = await client.SendAsync(secondRefresh, cancellationToken);
        Assert.Equal(HttpStatusCode.OK, renewed.StatusCode);

        await using var db = postgres.CreateContext();
        Assert.Equal(3, await db.RefreshTokens.CountAsync(cancellationToken));
        Assert.Equal(2, await db.RefreshTokens.CountAsync(token => token.IsRevoked, cancellationToken));
    }

    [Fact]
    public async Task Google_callback_exchange_is_browser_bound_and_single_use()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        await using var factory = Factory();
        using var client = Client(factory);
        var externalCookie = await ExternalCookieAsync(factory, "google@wukna.test",
            "google-provider-key", null);

        using var callback = Get("/api/auth/external/google/callback", externalCookie);
        using var redirected = await client.SendAsync(callback, cancellationToken);
        Assert.Equal(HttpStatusCode.Redirect, redirected.StatusCode);
        var code = RedirectParameter(redirected, "code");
        var binding = Cookie(redirected, ExternalLoginGrantService.BrowserBindingCookieName);

        using var unbound = PostJson("/api/auth/external/exchange", new { code });
        using var unboundResult = await client.SendAsync(unbound, cancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, unboundResult.StatusCode);
        Assert.Equal(ExternalLoginGrantService.CodeInvalid,
            (await unboundResult.Content.ReadFromJsonAsync<ErrorResponse>(cancellationToken))?.Error);

        using var exchange = PostJson("/api/auth/external/exchange", new { code }, binding);
        using var exchanged = await client.SendAsync(exchange, cancellationToken);
        Assert.Equal(HttpStatusCode.OK, exchanged.StatusCode);
        var session = await exchanged.Content.ReadFromJsonAsync<AuthResponseDto>(cancellationToken);
        Assert.NotNull(session);
        Assert.Equal("google@wukna.test", session.User.Email);
        Assert.StartsWith("wukna.refresh=", Cookie(exchanged, "wukna.refresh"));

        using var replay = PostJson("/api/auth/external/exchange", new { code }, binding);
        using var replayed = await client.SendAsync(replay, cancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, replayed.StatusCode);
        Assert.Equal(ExternalLoginGrantService.CodeInvalid,
            (await replayed.Content.ReadFromJsonAsync<ErrorResponse>(cancellationToken))?.Error);

        using var unlink = Delete("/api/auth/external/google/link", session.AccessToken);
        using var refused = await client.SendAsync(unlink, cancellationToken);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(GoogleAccountLinkService.CannotRemoveOnlyLogin,
            (await refused.Content.ReadFromJsonAsync<ErrorResponse>(cancellationToken))?.Error);

        await using var db = postgres.CreateContext();
        Assert.Single(await db.ExternalLoginGrants.ToListAsync(cancellationToken));
        Assert.All(await db.ExternalLoginGrants.ToListAsync(cancellationToken),
            grant => Assert.NotNull(grant.ConsumedAt));
        Assert.Single(await db.RefreshTokens.ToListAsync(cancellationToken));
    }

    [Fact]
    public async Task Existing_local_account_requires_explicit_link_and_can_unlink()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        await using var factory = Factory();
        using var client = Client(factory);
        var csrf = await GetCsrfAsync(client, cancellationToken);
        using var registration = PostJson("/api/auth/register",
            new RegisterRequestDto("local@wukna.test", "ValidPassword123!"), csrf.Cookie);
        registration.Headers.Add("X-CSRF-TOKEN", csrf.Token);
        using var registered = await client.SendAsync(registration, cancellationToken);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var session = await registered.Content.ReadFromJsonAsync<AuthResponseDto>(cancellationToken);
        Assert.NotNull(session);

        var externalCookie = await ExternalCookieAsync(factory, "local@wukna.test",
            "local-google-key", null);
        using var collision = Get("/api/auth/external/google/callback", externalCookie);
        using var collisionResult = await client.SendAsync(collision, cancellationToken);
        Assert.Equal(HttpStatusCode.Redirect, collisionResult.StatusCode);
        Assert.Equal(GoogleLoginService.AccountLinkRequired,
            RedirectParameter(collisionResult, "error"));

        using var intent = PostJson("/api/auth/external/google/link-intent", new { });
        intent.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        using var intentResult = await client.SendAsync(intent, cancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, intentResult.StatusCode);
        var intentCookie = Cookie(intentResult, GoogleLinkIntentService.CookieName);

        var linkedTicket = await ExternalCookieAsync(factory, "local@wukna.test",
            "local-google-key", session.User.Id);
        using var link = Get("/api/auth/external/google/link/callback", intentCookie, linkedTicket);
        using var linked = await client.SendAsync(link, cancellationToken);
        Assert.Equal(HttpStatusCode.Redirect, linked.StatusCode);
        Assert.Equal("google", RedirectParameter(linked, "linked"));

        using var account = Get("/api/auth/account");
        account.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        using var accountResult = await client.SendAsync(account, cancellationToken);
        Assert.Equal(HttpStatusCode.OK, accountResult.StatusCode);
        var status = await accountResult.Content.ReadFromJsonAsync<AccountResponse>(cancellationToken);
        Assert.NotNull(status);
        Assert.True(status.HasPassword);
        Assert.Contains(GoogleOAuthSettings.AuthenticationScheme, status.ExternalLogins);

        using var unlink = Delete("/api/auth/external/google/link", session.AccessToken);
        using var unlinked = await client.SendAsync(unlink, cancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, unlinked.StatusCode);

        using var accountAfter = Get("/api/auth/account");
        accountAfter.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        using var accountAfterResult = await client.SendAsync(accountAfter, cancellationToken);
        var remaining = await accountAfterResult.Content.ReadFromJsonAsync<AccountResponse>(cancellationToken);
        Assert.NotNull(remaining);
        Assert.Empty(remaining.ExternalLogins);
        Assert.True(remaining.HasPassword);
    }

    private WuknaWebApplicationFactory Factory() =>
        new(postgres, new ManualTimeProvider(DateTimeOffset.UtcNow));

    private static HttpClient Client(WuknaWebApplicationFactory factory) =>
        factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false
        });

    private static async Task<(string Token, string Cookie)> GetCsrfAsync(
        HttpClient client, CancellationToken cancellationToken)
    {
        using var response = await client.GetAsync("/api/auth/csrf", cancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var token = await response.Content.ReadFromJsonAsync<CsrfResponse>(cancellationToken);
        Assert.NotNull(token);
        return (token.Token, Cookie(response, "wukna.csrf"));
    }

    private static async Task<string> ExternalCookieAsync(
        WuknaWebApplicationFactory factory, string email, string providerKey, Guid? expectedXsrf)
    {
        using var scope = factory.Services.CreateScope();
        var signInManager = scope.ServiceProvider.GetRequiredService<SignInManager<User>>();
        var properties = signInManager.ConfigureExternalAuthenticationProperties(
            GoogleOAuthSettings.AuthenticationScheme,
            expectedXsrf is null ? GoogleOAuthSettings.ApplicationCallbackPath :
                GoogleOAuthSettings.LinkCallbackPath,
            expectedXsrf?.ToString());
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, providerKey),
            new Claim(ClaimTypes.Email, email),
            new Claim(GoogleOAuthSettings.EmailVerifiedClaim, "true")
        ], GoogleOAuthSettings.AuthenticationScheme));
        var context = new DefaultHttpContext { RequestServices = scope.ServiceProvider };
        context.Request.Scheme = "http";
        context.Request.Host = new HostString("localhost");
        await context.SignInAsync(IdentityConstants.ExternalScheme, principal, properties);
        return CookieStartingWith(context.Response.Headers.SetCookie!, "lapis.external");
    }

    private static HttpRequestMessage Get(string path, params string[] cookies)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        AddCookies(request, cookies);
        return request;
    }

    private static HttpRequestMessage Delete(string path, string accessToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return request;
    }

    private static HttpRequestMessage PostJson<T>(string path, T payload, params string[] cookies)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(payload)
        };
        AddCookies(request, cookies);
        return request;
    }

    private static void AddCookies(HttpRequestMessage request, params string[] cookies)
    {
        if (cookies.Length > 0)
            request.Headers.TryAddWithoutValidation("Cookie", string.Join("; ", cookies));
    }

    private static string Cookie(HttpResponseMessage response, string name) =>
        CookieStartingWith(CookieHeaders(response), name);

    private static string CookieStartingWith(IEnumerable<string> headers, string prefix) =>
        headers.Single(header => header.StartsWith(prefix, StringComparison.Ordinal))
            .Split(';', 2)[0];

    private static IEnumerable<string> CookieHeaders(HttpResponseMessage response)
    {
        Assert.True(response.Headers.TryGetValues("Set-Cookie", out var headers));
        return headers;
    }

    private static string RedirectParameter(HttpResponseMessage response, string name)
    {
        Assert.NotNull(response.Headers.Location);
        var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(
            response.Headers.Location.Query);
        return query[name].ToString();
    }

    private sealed record CsrfResponse(string Token);
    private sealed record ErrorResponse(string Error);
    private sealed record AccountResponse(Guid Id, string Email, bool HasPassword,
        string[] ExternalLogins);
}
