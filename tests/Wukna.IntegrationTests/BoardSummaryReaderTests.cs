namespace Wukna.IntegrationTests;

using System.Text.Json;
using Wukna.Features.Board;
using Wukna.Features.NoteConnection;
using Wukna.Features.Notes;
using Wukna.Features.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Xunit;

public sealed class BoardSummaryReaderTests(PostgresFixture postgres)
{
    [Fact]
    public async Task ListAsync_filters_authorization_and_projects_exact_counts()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        var owner = User("owner@wukna.test");
        var editor = User("editor@wukna.test");
        var viewer = User("viewer@wukna.test");
        var unrelated = User("elsewhere@wukna.test");
        var board = Board("Gathered work", owner, editor, viewer);
        var emptyBoard = Board("Empty refuge", owner);
        var singleNodeBoard = Board("One thought", owner);
        board.Notes.Add(Note(board.Id, NoteKind.Standalone, "A note", 10, 20, "#EEE8DB"));
        var list = Note(board.Id, NoteKind.List, "A list", 320, 80, "#DEE5D4");
        board.Notes.Add(list);
        board.Notes.Add(Checklist(board.Id, list.Id, "Open", false));
        board.Notes.Add(Checklist(board.Id, list.Id, "Done", true));
        singleNodeBoard.Notes.Add(Note(
            singleNodeBoard.Id, NoteKind.Standalone, "Only node", 12, 24, "#EADCE1"));

        await using (var db = postgres.CreateContext())
        {
            db.Users.AddRange(owner, editor, viewer, unrelated);
            db.Boards.AddRange(board, emptyBoard, singleNodeBoard);
            await db.SaveChangesAsync(cancellationToken);
        }

        await using var readDb = postgres.CreateContext();
        var reader = new BoardSummaryReader(readDb);
        var owned = await reader.ListAsync(owner.Id, cancellationToken);
        var editorBoards = await reader.ListAsync(editor.Id, cancellationToken);
        var viewerBoards = await reader.ListAsync(viewer.Id, cancellationToken);
        var unrelatedBoards = await reader.ListAsync(unrelated.Id, cancellationToken);

        Assert.Equal(3, owned.Count);
        var summary = Assert.Single(owned, item => item.Id == board.Id);
        Assert.Equal(BoardRole.Owner, summary.Role);
        Assert.True(summary.CanEdit);
        Assert.Equal(1, summary.NoteCount);
        Assert.Equal(1, summary.TaskListCount);
        Assert.Equal(2, summary.TaskItemCount);
        Assert.Equal(1, summary.CompletedTaskItemCount);
        Assert.Equal(3, summary.MemberCount);
        Assert.Equal(2, summary.PreviewNodes.Count);
        Assert.Empty(Assert.Single(owned, item => item.Id == emptyBoard.Id).PreviewNodes);
        Assert.Single(Assert.Single(owned, item => item.Id == singleNodeBoard.Id).PreviewNodes);

        Assert.True(Assert.Single(editorBoards).CanEdit);
        Assert.Equal(BoardRole.Guest, Assert.Single(editorBoards).Role);
        Assert.False(Assert.Single(viewerBoards).CanEdit);
        Assert.Empty(unrelatedBoards);
        Assert.DoesNotContain("Private body", JsonSerializer.Serialize(summary));
    }

    [Fact]
    public async Task ListAsync_returns_deterministic_database_bounded_previews_without_dangling_edges()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        var owner = User("preview@wukna.test");
        var board = Board("Spatial memory", owner);
        var origin = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var notes = Enumerable.Range(1, BoardSummaryReader.PreviewNodeLimit + 5)
            .Select(index => Note(
                board.Id,
                index % 3 == 0 ? NoteKind.List : NoteKind.Standalone,
                $"Node {index}",
                index * 37,
                index * -19,
                index == 1 ? "#EFDDD1" : "#DCE7EB",
                origin.AddMinutes(index)))
            .ToArray();
        foreach (var note in notes) board.Notes.Add(note);

        for (var index = 0; index < BoardSummaryReader.PreviewConnectionLimit + 4; index++)
        {
            board.Notes.First().OutgoingConnections.Add(new NoteConnection
            {
                BoardId = board.Id,
                SourceNoteId = notes[index % 8].Id,
                TargetNoteId = notes[(index % 8) + 8].Id,
                Type = index % 2 == 0 ? ConnectionType.Related : ConnectionType.Prerequisite,
                CreatedAt = origin.AddHours(index)
            });
        }
        board.Notes.First().OutgoingConnections.Add(new NoteConnection
        {
            BoardId = board.Id,
            SourceNoteId = notes[0].Id,
            TargetNoteId = notes[^1].Id,
            Type = ConnectionType.Related,
            CreatedAt = origin.AddDays(2)
        });

        await using (var db = postgres.CreateContext())
        {
            db.Users.Add(owner);
            db.Boards.Add(board);
            await db.SaveChangesAsync(cancellationToken);
        }

        await using var readDb = postgres.CreateContext();
        var reader = new BoardSummaryReader(readDb);
        var first = Assert.Single(await reader.ListAsync(owner.Id, cancellationToken));
        var second = Assert.Single(await reader.ListAsync(owner.Id, cancellationToken));

        Assert.Equal(BoardSummaryReader.PreviewNodeLimit, first.PreviewNodes.Count);
        Assert.Equal(BoardSummaryReader.PreviewConnectionLimit, first.PreviewConnections.Count);
        Assert.Equal(first.PreviewNodes.Select(node => node.Id), second.PreviewNodes.Select(node => node.Id));
        Assert.Equal(
            first.PreviewConnections.Select(edge => (edge.SourceId, edge.TargetId, edge.Type)),
            second.PreviewConnections.Select(edge => (edge.SourceId, edge.TargetId, edge.Type)));
        var selected = first.PreviewNodes.Select(node => node.Id).ToHashSet();
        Assert.All(first.PreviewConnections, edge =>
        {
            Assert.Contains(edge.SourceId, selected);
            Assert.Contains(edge.TargetId, selected);
        });
        var preserved = Assert.Single(first.PreviewNodes, node => node.Id == notes[0].Id);
        Assert.Equal(37, preserved.X);
        Assert.Equal(-19, preserved.Y);
        Assert.Equal("#EFDDD1", preserved.Color);
    }

    [Fact]
    public async Task ListAsync_uses_a_constant_three_query_shape_for_many_boards()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        var owner = User("scale@wukna.test");
        var boards = Enumerable.Range(0, 30).Select(index =>
        {
            var board = Board($"Board {index}", owner);
            var first = Note(board.Id, NoteKind.Standalone, "First", 0, 0, "#EEE8DB");
            var second = Note(board.Id, NoteKind.Standalone, "Second", 300, 160, "#DEE5D4");
            board.Notes.Add(first);
            board.Notes.Add(second);
            first.OutgoingConnections.Add(new NoteConnection
            {
                BoardId = board.Id,
                SourceNoteId = first.Id,
                TargetNoteId = second.Id,
                Type = ConnectionType.Related
            });
            return board;
        }).ToArray();

        await using (var db = postgres.CreateContext())
        {
            db.Users.Add(owner);
            db.Boards.AddRange(boards);
            await db.SaveChangesAsync(cancellationToken);
        }

        var counter = new CommandCounterInterceptor();
        await using var readDb = postgres.CreateContext(counter);
        var summaries = await new BoardSummaryReader(readDb).ListAsync(owner.Id, cancellationToken);

        Assert.Equal(30, summaries.Count);
        Assert.Equal(3, counter.Count);
        Assert.All(counter.Commands.Skip(1), command =>
            Assert.Contains("LIMIT", command, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task UpdatedAt_migration_uses_created_at_as_the_truthful_existing_row_baseline()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var db = postgres.CreateContext();
        await db.Database.EnsureDeletedAsync(cancellationToken);
        var migrator = db.Database.GetService<IMigrator>();
        await migrator.MigrateAsync(
            "20260915215039_FinalizeModelsAndExternalLogin", cancellationToken);
        var boardId = Guid.NewGuid();
        var createdAt = new DateTimeOffset(2024, 4, 5, 6, 7, 8, TimeSpan.Zero);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO boards (id, title, created_at) VALUES ({boardId}, {"Existing"}, {createdAt})",
            cancellationToken);

        await migrator.MigrateAsync(cancellationToken: cancellationToken);

        var updatedAt = await db.Boards.AsNoTracking()
            .Where(board => board.Id == boardId)
            .Select(board => board.UpdatedAt)
            .SingleAsync(cancellationToken);
        Assert.Equal(createdAt, updatedAt);
    }

    private static User User(string email) => new()
    {
        Email = email,
        NormalizedEmail = email.ToUpperInvariant(),
        UserName = email,
        NormalizedUserName = email.ToUpperInvariant(),
        EmailConfirmed = true
    };

    private static Board Board(string title, User owner, User? editor = null, User? viewer = null)
    {
        var board = new Board
        {
            Title = title,
            CreatedAt = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero),
            UpdatedAt = new DateTimeOffset(2026, 1, 2, 0, 0, 0, TimeSpan.Zero)
        };
        board.Memberships.Add(new BoardMembership
        {
            User = owner,
            Role = BoardRole.Owner,
            CanEdit = true
        });
        if (editor is not null)
            board.Memberships.Add(new BoardMembership
            {
                User = editor,
                Role = BoardRole.Guest,
                CanEdit = true
            });
        if (viewer is not null)
            board.Memberships.Add(new BoardMembership
            {
                User = viewer,
                Role = BoardRole.Guest,
                CanEdit = false
            });
        return board;
    }

    private static Note Note(Guid boardId, NoteKind kind, string title, double x, double y,
        string color, DateTimeOffset? createdAt = null) => new()
    {
        BoardId = boardId,
        Kind = kind,
        Title = title,
        Content = $"Private body for {title}",
        PositionX = x,
        PositionY = y,
        Width = 240,
        Height = 160,
        Color = color,
        CreatedAt = createdAt ?? new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero)
    };

    private static Note Checklist(Guid boardId, Guid parentId, string title, bool completed) => new()
    {
        BoardId = boardId,
        ParentNoteId = parentId,
        Kind = NoteKind.ChecklistItem,
        Title = title,
        Content = string.Empty,
        PositionX = null,
        PositionY = null,
        Color = "#EEE8DB",
        IsCompleted = completed
    };
}
