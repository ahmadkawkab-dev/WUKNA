namespace Lapis.Features.Users;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> entity)
    {
        // Keep direct database inserts consistent with users created by the application.
        entity.Property(user => user.CreatedAt).HasDefaultValueSql("now()");
        entity.Property(user => user.Username).HasMaxLength(30).IsRequired();
        entity.Property(user => user.NormalizedUsername).HasMaxLength(30).IsRequired();
        entity.Property(user => user.DisplayName).HasMaxLength(80);
        entity.Property(user => user.ProfileImageKey).HasMaxLength(80);
        entity.Property(user => user.ProfileImageVersion).HasMaxLength(40);
        entity.HasIndex(user => user.NormalizedUsername).HasDatabaseName("ix_asp_net_users_normalized_username").IsUnique();

        // Identity normalizes email casing before persistence. Database uniqueness closes the
        // race where two requests both pass UserManager's duplicate-email check concurrently.
        entity.HasIndex(user => user.NormalizedEmail)
              .HasDatabaseName("EmailIndex")
              .IsUnique();
    }
}
