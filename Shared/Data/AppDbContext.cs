using Microsoft.EntityFrameworkCore;
using Wukna.Features.Users;
using Wukna.Features.Board;
using Wukna.Features.Notes;
using Wukna.Features.NoteConnection;
using Wukna.Features.Auth;
using Wukna.Features.Tasks;
using Wukna.Features.Calendar;
using Wukna.Features.Notifications;
using Wukna.Features.Chat;
using Wukna.Features.Library;
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
    public DbSet<PersonalTask> PersonalTasks => Set<PersonalTask>();
    public DbSet<PersonalTaskList> PersonalTaskLists => Set<PersonalTaskList>();
    public DbSet<TaskTemplate> TaskTemplates => Set<TaskTemplate>();
    public DbSet<PlanningSettings> PlanningSettings => Set<PlanningSettings>();
    public DbSet<CalendarEvent> CalendarEvents => Set<CalendarEvent>();
    public DbSet<TaskReminder> TaskReminders => Set<TaskReminder>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<NotificationPreference> NotificationPreferences => Set<NotificationPreference>();
    public DbSet<BoardNotificationPreference> BoardNotificationPreferences => Set<BoardNotificationPreference>();
    public DbSet<BrowserPushSubscription> BrowserPushSubscriptions => Set<BrowserPushSubscription>();
    public DbSet<NotificationWork> NotificationWork => Set<NotificationWork>();
    public DbSet<NotificationClientPresence> NotificationClientPresence => Set<NotificationClientPresence>();
    public DbSet<CalendarEventReminder> CalendarEventReminders => Set<CalendarEventReminder>();
    public DbSet<BoardChatSettings> BoardChatSettings => Set<BoardChatSettings>();
    public DbSet<BoardMemberChatState> BoardMemberChatStates => Set<BoardMemberChatState>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<ChatAttachment> ChatAttachments => Set<ChatAttachment>();
    public DbSet<ScheduledChatTask> ScheduledChatTasks => Set<ScheduledChatTask>();
    public DbSet<ChatOutboxEvent> ChatOutboxEvents => Set<ChatOutboxEvent>();
    public DbSet<ChatBlobWork> ChatBlobWork => Set<ChatBlobWork>();
    public DbSet<LibraryItem> LibraryItems => Set<LibraryItem>();
    public DbSet<LibraryFolder> LibraryFolders => Set<LibraryFolder>();
    public DbSet<LibraryAsset> LibraryAssets => Set<LibraryAsset>();
    public DbSet<LibraryDocument> LibraryDocuments => Set<LibraryDocument>();
    public DbSet<LibraryVideo> LibraryVideos => Set<LibraryVideo>();
    public DbSet<LibraryCollection> LibraryCollections => Set<LibraryCollection>();
    public DbSet<LibraryCollectionItem> LibraryCollectionItems => Set<LibraryCollectionItem>();
    public DbSet<StorageEntitlement> StorageEntitlements => Set<StorageEntitlement>();
    public DbSet<StorageReservation> StorageReservations => Set<StorageReservation>();
    public DbSet<LibraryBlobWork> LibraryBlobWork => Set<LibraryBlobWork>();


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
