using Microsoft.EntityFrameworkCore;
using Lapis.Features.Users;
using Lapis.Features.Board;
using Lapis.Features.Notes;
using Lapis.Features.NoteConnection;
using Lapis.Features.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;

namespace Lapis.Shared.Data.AppDbContext;

public class LapisDbContext : IdentityUserContext<User, Guid>
{
    public LapisDbContext(DbContextOptions<LapisDbContext> options) : base(options)
    {
        
    }

    //DbSets
    public DbSet<Board> Boards  => Set<Board>();
    public DbSet<BoardMembership> BoardMemberships => Set<BoardMembership>();
    public DbSet<Note> Notes  => Set<Note>();
    public DbSet<NoteConnection> NoteConnections => Set<NoteConnection>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();


protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.ApplyConfigurationsFromAssembly(typeof(LapisDbContext).Assembly);

        // Identity assigns PascalCase table names explicitly, so the global naming
        // convention cannot rename these four tables by itself.
        builder.Entity<User>().ToTable("asp_net_users");
        builder.Entity<IdentityUserClaim<Guid>>().ToTable("asp_net_user_claims");
        builder.Entity<IdentityUserLogin<Guid>>().ToTable("asp_net_user_logins");
        builder.Entity<IdentityUserToken<Guid>>().ToTable("asp_net_user_tokens");

    }
}
