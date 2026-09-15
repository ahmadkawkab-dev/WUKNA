namespace Lapis.Features.Auth;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> entity)
    {
        entity.HasKey(token => token.Id);
        entity.HasIndex(token => token.TokenHash).IsUnique();
        entity.HasIndex(token => new { token.UserId, token.IsRevoked });
        entity.Property(token => token.TokenHash).IsRequired().HasMaxLength(256);

        entity.HasOne(token => token.User)
              .WithMany()
              .HasForeignKey(token => token.UserId)
              .OnDelete(DeleteBehavior.Cascade);
    }
}
