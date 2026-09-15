namespace Lapis.Features.Users;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> entity)
    {
        // Keep direct database inserts consistent with users created by the application.
        entity.Property(user => user.CreatedAt).HasDefaultValueSql("now()");
    }
}
