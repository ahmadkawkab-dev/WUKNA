using Microsoft.EntityFrameworkCore;
using Lapis.Features.Auth;
using Lapis.Features.Board;
using Lapis.Features.Users;
using Lapis.Shared.Data.AppDbContext;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddControllersWithViews();
builder.Services.AddHealthChecks();

// Keep runtime mapping aligned with the design-time factory before creating migrations.
builder.Services.AddDbContext<LapisDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres"))
           .UseSnakeCaseNamingConvention());

var jwtOptions = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
// WebApplicationBuilder loads User Secrets automatically in Development.
// Validate each setting separately so configuration errors identify the exact key to fix.
ValidateJwtOptions(jwtOptions);

builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<JwtTokenGenerator>();
builder.Services.AddScoped<SessionIssuer>();
builder.Services.AddScoped<AuthService>();

builder.Services.AddIdentityCore<User>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        options.Lockout.MaxFailedAccessAttempts = 5;
    })
    .AddEntityFrameworkStores<LapisDbContext>()
    .AddSignInManager();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SigningKey)),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "lapis.csrf";
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.None
        : CookieSecurePolicy.Always;
});

var app = builder.Build();

   

app.UseSwagger();
app.UseSwaggerUI();


app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health");
app.MapAuthEndpoints();
app.MapBoardEndpoints();

app.MapControllerRoute(name: "default", pattern: "{controller=Health}/{action=Index}/{id?}");

app.Run();

static void ValidateJwtOptions(JwtOptions options)
{
    if (string.IsNullOrWhiteSpace(options.Issuer))
        throw new InvalidOperationException("Jwt:Issuer is required.");
    if (string.IsNullOrWhiteSpace(options.Audience))
        throw new InvalidOperationException("Jwt:Audience is required.");
    if (string.IsNullOrWhiteSpace(options.SigningKey))
        throw new InvalidOperationException("Jwt:SigningKey is required.");
    if (Encoding.UTF8.GetByteCount(options.SigningKey) < 32)
        throw new InvalidOperationException("Jwt:SigningKey must contain at least 32 bytes.");
    if (options.AccessTokenMinutes is < 1 or > 60)
        throw new InvalidOperationException("Jwt:AccessTokenMinutes must be between 1 and 60.");
    if (options.RefreshTokenDays is < 1 or > 365)
        throw new InvalidOperationException("Jwt:RefreshTokenDays must be between 1 and 365.");
}
