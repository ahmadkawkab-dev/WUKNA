namespace Wukna.IntegrationTests;

using System.Net.Http.Headers;
using System.Net.Http.Json;
using Wukna.Features.Auth;
using Wukna.Features.Board;
using Wukna.Features.NoteConnection;
using Wukna.Features.Notes;
using Wukna.Features.Users;
using Microsoft.EntityFrameworkCore;
using Xunit;

public sealed class BoardActivityEndpointTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Durable_board_mutations_advance_updated_at_and_reads_do_not()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        var initial = DateTimeOffset.UtcNow.AddDays(-2);
        var clock = new ManualTimeProvider(DateTimeOffset.UtcNow);
        var owner = User("activity-owner@wukna.test");
        var guest = User("activity-guest@wukna.test");
        var board = new Board
        {
            Title = "Activity board",
            CreatedAt = initial,
            UpdatedAt = initial
        };
        board.Memberships.Add(new BoardMembership
        {
            User = owner,
            Role = BoardRole.Owner,
            CanEdit = true
        });

        await using (var db = postgres.CreateContext())
        {
            db.Users.AddRange(owner, guest);
            db.Boards.Add(board);
            await db.SaveChangesAsync(cancellationToken);
        }

        await using var factory = new WuknaWebApplicationFactory(postgres, clock);
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", AccessToken(owner, clock));

        await Advances("rename", () => client.PatchAsJsonAsync(
            $"/api/boards/{board.Id}", new { title = "Renamed board" }, cancellationToken));

        var note = await CreatesNote(new
        {
            kind = 0,
            title = "Seed note",
            content = "Body",
            positionX = 20,
            positionY = 40,
            color = "#EEE8DB"
        });
        var staleVersion = note.Version;
        note = await PatchNote(note, new { title = "Edited note" }, "note edit");
        var beforeConflict = await UpdatedAt();
        clock.Advance(TimeSpan.FromSeconds(1));
        using (var staleRequest = new HttpRequestMessage(
            HttpMethod.Patch, $"/api/boards/{board.Id}/notes/{note.Id}"))
        {
            staleRequest.Content = JsonContent.Create(new { title = "Stale title" });
            staleRequest.Headers.TryAddWithoutValidation("If-Match", $"\"{staleVersion}\"");
            using var staleResponse = await client.SendAsync(staleRequest, cancellationToken);
            Assert.Equal(System.Net.HttpStatusCode.Conflict, staleResponse.StatusCode);
        }
        Assert.Equal(beforeConflict, await UpdatedAt());
        note = await PatchNote(note, new { positionX = 240, positionY = -60 }, "note move");
        note = await PatchNote(note, new { width = 320, height = 210 }, "note resize");
        note = await PatchNote(note, new { color = "#DEE5D4" }, "note color");

        var taskList = await CreatesNote(new
        {
            kind = 1,
            title = "Tasks",
            positionX = 400,
            positionY = 100,
            color = "#EEE2BF"
        });
        var taskItem = await CreatesNote(new
        {
            kind = 2,
            title = "First task",
            parentNoteId = taskList.Id
        });
        taskItem = await PatchNote(taskItem, new { isCompleted = true }, "task completion");
        await DeletesNote(taskItem, "task deletion");

        NoteConnectionDto? connection = null;
        await Advances("connection creation", async () =>
        {
            var response = await client.PostAsJsonAsync(
                $"/api/boards/{board.Id}/connections",
                new { sourceNoteId = note.Id, targetNoteId = taskList.Id, type = 0 },
                cancellationToken);
            response.EnsureSuccessStatusCode();
            connection = await response.Content.ReadFromJsonAsync<NoteConnectionDto>(
                cancellationToken: cancellationToken);
            return response;
        });
        Assert.NotNull(connection);
        await Advances("connection deletion", () => client.DeleteAsync(
            $"/api/boards/{board.Id}/connections/{connection.Id}", cancellationToken));

        await Advances("membership creation", () => client.PutAsJsonAsync(
            $"/api/boards/{board.Id}/guests",
            new { email = guest.Email, canEdit = false }, cancellationToken));
        await Advances("membership permission change", () => client.PutAsJsonAsync(
            $"/api/boards/{board.Id}/guests",
            new { email = guest.Email, canEdit = true }, cancellationToken));
        await Advances("membership removal", () => client.DeleteAsync(
            $"/api/boards/{board.Id}/guests/{guest.Id}", cancellationToken));

        await DeletesNote(taskList, "task-list deletion");
        await DeletesNote(note, "note deletion");

        var beforeReads = await UpdatedAt();
        var readResponses = await Task.WhenAll(
            client.GetAsync("/api/boards", cancellationToken),
            client.GetAsync($"/api/boards/{board.Id}", cancellationToken),
            client.GetAsync($"/api/boards/{board.Id}/notes", cancellationToken),
            client.GetAsync($"/api/boards/{board.Id}/connections", cancellationToken),
            client.GetAsync($"/api/boards/{board.Id}/members", cancellationToken));
        Assert.All(readResponses, response => response.EnsureSuccessStatusCode());
        Assert.Equal(beforeReads, await UpdatedAt());

        async Task<NoteDto> CreatesNote(object request)
        {
            NoteDto? created = null;
            await Advances("note/task creation", async () =>
            {
                var response = await client.PostAsJsonAsync(
                    $"/api/boards/{board.Id}/notes", request, cancellationToken);
                response.EnsureSuccessStatusCode();
                created = await response.Content.ReadFromJsonAsync<NoteDto>(
                    cancellationToken: cancellationToken);
                return response;
            });
            return Assert.IsType<NoteDto>(created);
        }

        async Task<NoteDto> PatchNote(NoteDto current, object request, string label)
        {
            NoteDto? updated = null;
            await Advances(label, async () =>
            {
                using var message = new HttpRequestMessage(
                    HttpMethod.Patch, $"/api/boards/{board.Id}/notes/{current.Id}")
                {
                    Content = JsonContent.Create(request)
                };
                message.Headers.TryAddWithoutValidation("If-Match", $"\"{current.Version}\"");
                var response = await client.SendAsync(message, cancellationToken);
                response.EnsureSuccessStatusCode();
                updated = await response.Content.ReadFromJsonAsync<NoteDto>(
                    cancellationToken: cancellationToken);
                return response;
            });
            return Assert.IsType<NoteDto>(updated);
        }

        Task DeletesNote(NoteDto current, string label) => Advances(label, async () =>
        {
            using var message = new HttpRequestMessage(
                HttpMethod.Delete, $"/api/boards/{board.Id}/notes/{current.Id}");
            message.Headers.TryAddWithoutValidation("If-Match", $"\"{current.Version}\"");
            return await client.SendAsync(message, cancellationToken);
        });

        async Task Advances(string label, Func<Task<HttpResponseMessage>> mutation)
        {
            var previous = await UpdatedAt();
            var expected = clock.Advance(TimeSpan.FromSeconds(1));
            using var response = await mutation();
            response.EnsureSuccessStatusCode();
            var actual = await UpdatedAt();
            Assert.True(actual > previous, $"{label} did not advance UpdatedAt");
            Assert.InRange(actual, expected.AddTicks(-10), expected.AddTicks(10));
        }

        async Task<DateTimeOffset> UpdatedAt()
        {
            await using var db = postgres.CreateContext();
            return await db.Boards.AsNoTracking()
                .Where(candidate => candidate.Id == board.Id)
                .Select(candidate => candidate.UpdatedAt)
                .SingleAsync(cancellationToken);
        }
    }

    private static string AccessToken(User user, TimeProvider clock)
    {
        var options = new JwtOptions
        {
            Issuer = WuknaWebApplicationFactory.JwtIssuer,
            Audience = WuknaWebApplicationFactory.JwtAudience,
            SigningKey = WuknaWebApplicationFactory.JwtSigningKey,
            AccessTokenMinutes = 60,
            RefreshTokenDays = 7
        };
        return new JwtTokenGenerator(options, clock).CreateAccessToken(user).Token;
    }

    private static User User(string email) => new()
    {
        Email = email,
        NormalizedEmail = email.ToUpperInvariant(),
        UserName = email,
        NormalizedUserName = email.ToUpperInvariant(),
        EmailConfirmed = true
    };
}
