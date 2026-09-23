using Microsoft.EntityFrameworkCore;
using Wukna.Features.Users;
using Wukna.Features.Board;
using Wukna.Features.Notes;
using Wukna.Features.NoteConnection;
using Wukna.Features.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;

namespace Wukna.Shared.Data.AppDbContext;

public class WuknaDbContext : IdentityUserContext<User, Guid>
{
    public WuknaDbContext(DbContextOptions<WuknaDbContext> options) : base(options)
    {
        
    }

    //DbSets
    public DbSet<Board> Boards  => Set<Board>();
    public DbSet<BoardMembership> BoardMemberships => Set<BoardMembership>();
    public DbSet<Note> Notes  => Set<Note>();
    public DbSet<NoteConnection> NoteConnections => Set<NoteConnection>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<ExternalLoginGrant> ExternalLoginGrants => Set<ExternalLoginGrant>();


protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.ApplyConfigurationsFromAssembly(typeof(WuknaDbContext).Assembly);

        // Identity assigns PascalCase table names explicitly, so the global naming
        // convention cannot rename these four tables by itself.
        builder.Entity<User>().ToTable("asp_net_users");
        builder.Entity<IdentityUserClaim<Guid>>().ToTable("asp_net_user_claims");
        builder.Entity<IdentityUserLogin<Guid>>().ToTable("asp_net_user_logins");
        builder.Entity<IdentityUserToken<Guid>>().ToTable("asp_net_user_tokens");

    }
}
