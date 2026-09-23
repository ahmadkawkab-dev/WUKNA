namespace Wukna.Features.Auth;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class ExternalLoginGrantConfiguration
    : IEntityTypeConfiguration<ExternalLoginGrant>
{
    public void Configure(EntityTypeBuilder<ExternalLoginGrant> entity)
    {
        entity.HasKey(grant => grant.Id);

        // SHA-256 hashes encoded as uppercase hexadecimal contain exactly 64 characters.
        entity.Property(grant => grant.CodeHash)
              .IsRequired()
              .HasMaxLength(64);
        entity.Property(grant => grant.BrowserBindingHash)
              .IsRequired()
              .HasMaxLength(64);

        // The unique code hash prevents two grants from representing the same credential.
        entity.HasIndex(grant => grant.CodeHash).IsUnique();
        entity.HasIndex(grant => grant.ExpiresAt);

        entity.HasOne(grant => grant.User)
              .WithMany()
              .HasForeignKey(grant => grant.UserId)
              .OnDelete(DeleteBehavior.Cascade);
    }
}
