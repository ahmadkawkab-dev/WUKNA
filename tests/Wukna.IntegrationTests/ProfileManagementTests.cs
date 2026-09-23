namespace Wukna.IntegrationTests;

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Wukna.Features.Auth;
using Wukna.Features.Profile;
using Wukna.Features.Users;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

public sealed class ProfileManagementTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Profile_is_private_to_the_authenticated_user_and_username_is_case_insensitively_unique()
    {
        var ct = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(ct);
        var first = User("first@wukna.test");
        var second = User("second@wukna.test");
        first.Username = "first";
        first.NormalizedUsername = "FIRST";
        await using (var db = postgres.CreateContext())
        {
            db.Users.AddRange(first, second);
            await db.SaveChangesAsync(ct);
        }
        var clock = new ManualTimeProvider(DateTimeOffset.UtcNow);
        await using var factory = new WuknaWebApplicationFactory(postgres, clock);
        using var anonymous = factory.CreateClient();
        using var denied = await anonymous.GetAsync("/api/profile", ct);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        using var deniedPatch = await anonymous.PatchAsJsonAsync("/api/profile",
            new UpdateProfileRequest("secondname", "No access"), ct);
        Assert.Equal(HttpStatusCode.Unauthorized, deniedPatch.StatusCode);
        using var deniedRemove = await anonymous.DeleteAsync("/api/profile/avatar", ct);
        Assert.Equal(HttpStatusCode.Unauthorized, deniedRemove.StatusCode);

        using var firstClient = Client(factory, first, clock);
        var initial = await firstClient.GetFromJsonAsync<ProfileDto>("/api/profile", ct);
        Assert.NotNull(initial);
        Assert.Equal(first.Id, initial.UserId);
        Assert.Equal(first.Email, initial.Email);
        Assert.Null(initial.ProfileImageUrl);

        using var secondClient = Client(factory, second, clock);
        using var collision = await secondClient.PatchAsJsonAsync("/api/profile",
            new UpdateProfileRequest("FIRST", "Second User"), ct);
        Assert.Equal(HttpStatusCode.Conflict, collision.StatusCode);
        using (var body = JsonDocument.Parse(await collision.Content.ReadAsStringAsync(ct)))
            Assert.Equal("username_taken", body.RootElement.GetProperty("code").GetString());

        using var invalid = await firstClient.PatchAsJsonAsync("/api/profile",
            new UpdateProfileRequest("not a username", "Valid name"), ct);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        using (var body = JsonDocument.Parse(await invalid.Content.ReadAsStringAsync(ct)))
            Assert.Equal("invalid_username", body.RootElement.GetProperty("code").GetString());
        using var longName = await firstClient.PatchAsJsonAsync("/api/profile",
            new UpdateProfileRequest("first", new string('x', 81)), ct);
        Assert.Equal(HttpStatusCode.BadRequest, longName.StatusCode);
        using (var body = JsonDocument.Parse(await longName.Content.ReadAsStringAsync(ct)))
            Assert.Equal("display_name_too_long", body.RootElement.GetProperty("code").GetString());

        using var updated = await firstClient.PatchAsJsonAsync("/api/profile",
            new UpdateProfileRequest("Ahmad.K", "Ahmad K."), ct);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var profile = await updated.Content.ReadFromJsonAsync<ProfileDto>(ct);
        Assert.NotNull(profile);
        Assert.Equal("Ahmad.K", profile.Username);
        Assert.Equal("Ahmad K.", profile.DisplayName);
        var secondProfile = await secondClient.GetFromJsonAsync<ProfileDto>("/api/profile", ct);
        Assert.Equal(second.Id, secondProfile?.UserId);
        Assert.NotEqual(profile.UserId, secondProfile?.UserId);
        await using var check = postgres.CreateContext();
        Assert.Equal("AHMAD.K", await check.Users.Where(user => user.Id == first.Id)
            .Select(user => user.NormalizedUsername).SingleAsync(ct));
    }

    [Fact]
    public async Task Avatar_upload_replacement_and_removal_use_generated_storage_and_reject_bad_content()
    {
        var ct = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(ct);
        var user = User("avatar@wukna.test");
        await using (var db = postgres.CreateContext())
        {
            db.Users.Add(user);
            await db.SaveChangesAsync(ct);
        }
        var clock = new ManualTimeProvider(DateTimeOffset.UtcNow);
        var directory = Path.Combine(Path.GetTempPath(), $"wukna-profile-test-{Guid.NewGuid():N}");
        await using var factory = new WuknaWebApplicationFactory(postgres, clock)
            .WithWebHostBuilder(builder => builder.UseSetting("ProfileImages:Directory", directory));
        using var client = Client(factory, user, clock);

        using var corrupt = await Upload(client, [1, 2, 3, 4]);
        Assert.Equal(HttpStatusCode.BadRequest, corrupt.StatusCode);
        using var unsupported = await Upload(client, await Png(2, 2), "image/gif");
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, unsupported.StatusCode);
        using var tooLarge = await Upload(client, new byte[5 * 1024 * 1024 + 1]);
        Assert.Equal((HttpStatusCode)413, tooLarge.StatusCode);
        using var dimensions = await Upload(client, await Png(4097, 1));
        Assert.Equal(HttpStatusCode.BadRequest, dimensions.StatusCode);

        using var uploaded = await Upload(client, await Png(8, 8));
        Assert.Equal(HttpStatusCode.OK, uploaded.StatusCode);
        var first = await uploaded.Content.ReadFromJsonAsync<AvatarDto>(ct);
        Assert.NotNull(first?.ProfileImageUrl);
        Assert.NotNull(first.ProfileImageVersion);
        var firstKey = await CurrentKey(user.Id);
        Assert.NotNull(firstKey);
        Assert.Matches("^[a-f0-9]{32}\\.webp$", firstKey);
        Assert.True(File.Exists(Path.Combine(directory, firstKey)));
        using var served = await client.GetAsync(first.ProfileImageUrl, ct);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/webp", served.Content.Headers.ContentType?.MediaType);

        using var replaced = await Upload(client, await Png(4, 4));
        Assert.Equal(HttpStatusCode.OK, replaced.StatusCode);
        var second = await replaced.Content.ReadFromJsonAsync<AvatarDto>(ct);
        Assert.NotEqual(first.ProfileImageVersion, second?.ProfileImageVersion);
        Assert.False(File.Exists(Path.Combine(directory, firstKey)));

        using var removed = await client.DeleteAsync("/api/profile/avatar", ct);
        Assert.Equal(HttpStatusCode.OK, removed.StatusCode);
        var empty = await removed.Content.ReadFromJsonAsync<AvatarDto>(ct);
        Assert.Null(empty?.ProfileImageUrl);
        Assert.Null(empty?.ProfileImageVersion);
        Assert.Null(await CurrentKey(user.Id));
        Directory.Delete(directory, recursive: true);

        async Task<string?> CurrentKey(Guid id)
        {
            await using var db = postgres.CreateContext();
            return await db.Users.Where(candidate => candidate.Id == id)
                .Select(candidate => candidate.ProfileImageKey).SingleAsync(ct);
        }
    }

    private static async Task<byte[]> Png(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height);
        await using var buffer = new MemoryStream();
        await image.SaveAsPngAsync(buffer);
        return buffer.ToArray();
    }

    private static Task<HttpResponseMessage> Upload(HttpClient client, byte[] bytes, string type = "image/png")
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(type);
        form.Add(file, "file", "untrusted-name.png");
        return client.PutAsync("/api/profile/avatar", form);
    }

    private static HttpClient Client(WebApplicationFactory<Program> factory, User user, TimeProvider clock)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", AccessToken(user, clock));
        return client;
    }

    private static string AccessToken(User user, TimeProvider clock) =>
        new JwtTokenGenerator(new JwtOptions
        {
            Issuer = WuknaWebApplicationFactory.JwtIssuer,
            Audience = WuknaWebApplicationFactory.JwtAudience,
            SigningKey = WuknaWebApplicationFactory.JwtSigningKey,
            AccessTokenMinutes = 60,
            RefreshTokenDays = 7
        }, clock).CreateAccessToken(user).Token;

    private static User User(string email) => new()
    {
        Email = email,
        NormalizedEmail = email.ToUpperInvariant(),
        UserName = email,
        NormalizedUserName = email.ToUpperInvariant(),
        EmailConfirmed = true
    };
}
