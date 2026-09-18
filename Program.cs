using Microsoft.EntityFrameworkCore;
using Lapis.Features.Auth;
using Lapis.Features.Board;
using Lapis.Features.Notes;
using Lapis.Features.NoteConnection;
using Lapis.Features.Users;
using Lapis.Shared.Data.AppDbContext;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
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
var googleSettings = builder.Configuration
    .GetSection(GoogleOAuthSettings.SectionName)
    .Get<GoogleOAuthSettings>() ?? new GoogleOAuthSettings();
ValidateGoogleOAuthSettings(googleSettings, builder.Environment);

builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton(googleSettings);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<JwtTokenGenerator>();
builder.Services.AddScoped<SessionIssuer>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<GoogleLoginService>();
builder.Services.AddScoped<ExternalLoginGrantService>();
builder.Services.AddScoped<GoogleLinkIntentService>();
builder.Services.AddScoped<GoogleAccountLinkService>();
builder.Services.AddHostedService<ExternalLoginGrantCleanupService>();
// Keep one application name across future replicas; share the key ring when scaling out.
builder.Services.AddDataProtection().SetApplicationName("Lapis");

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
    })
    .AddCookie(IdentityConstants.ExternalScheme, options =>
    {
        // This cookie only carries Google's validated principal from the provider callback
        // to Lapis's internal callback. It is separate from the application refresh cookie.
        options.Cookie.Name = "lapis.external";
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.None
            : CookieSecurePolicy.Always;
        options.Cookie.Path = "/api/auth";
        options.ExpireTimeSpan = TimeSpan.FromMinutes(10);
        options.SlidingExpiration = false;
    })
    .AddGoogle(GoogleOAuthSettings.AuthenticationScheme, options =>
    {
        options.ClientId = googleSettings.ClientId;
        options.ClientSecret = googleSettings.ClientSecret;
        options.SignInScheme = IdentityConstants.ExternalScheme;
        options.CallbackPath = GoogleOAuthSettings.ProviderCallbackPath;
        options.UsePkce = true;
        options.SaveTokens = false;

        // Google's user-info formats have used both names. Mapping both lets the callback
        // require verified email without relying on an unverified address.
        options.ClaimActions.MapJsonKey(
            GoogleOAuthSettings.EmailVerifiedClaim,
            "verified_email",
            ClaimValueTypes.Boolean);
        options.ClaimActions.MapJsonKey(
            GoogleOAuthSettings.EmailVerifiedClaim,
            "email_verified",
            ClaimValueTypes.Boolean);

        // Provider cancellation and malformed/failed remote callbacks return only stable public
        // error codes to the fixed frontend callback. Internal exception details are not exposed.
        options.Events.OnAccessDenied = context =>
        {
            context.HandleResponse();
            context.Response.Redirect(
                googleSettings.BuildFrontendErrorRedirect("oauth_cancelled"));
            return Task.CompletedTask;
        };
        options.Events.OnRemoteFailure = context =>
        {
            context.HandleResponse();
            context.Response.Redirect(
                googleSettings.BuildFrontendErrorRedirect(
                    GoogleLoginService.ExternalLoginFailed));
            return Task.CompletedTask;
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
app.MapNoteEndpoints();
app.MapNoteConnectionEndpoints();

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

static void ValidateGoogleOAuthSettings(
    GoogleOAuthSettings settings,
    IHostEnvironment environment)
{
    if (string.IsNullOrWhiteSpace(settings.ClientId))
        throw new InvalidOperationException("Authentication:Google:ClientId is required.");
    if (string.IsNullOrWhiteSpace(settings.ClientSecret))
        throw new InvalidOperationException("Authentication:Google:ClientSecret is required.");
    if (!Uri.TryCreate(settings.FrontendBaseUrl, UriKind.Absolute, out var frontendUri) ||
        frontendUri.UserInfo.Length > 0 ||
        frontendUri.AbsolutePath != "/" ||
        frontendUri.Query.Length > 0 ||
        frontendUri.Fragment.Length > 0 ||
        (frontendUri.Scheme != Uri.UriSchemeHttps &&
         !(environment.IsDevelopment() &&
           frontendUri.Scheme == Uri.UriSchemeHttp &&
           frontendUri.IsLoopback)))
    {
        throw new InvalidOperationException(
            "Authentication:Google:FrontendBaseUrl must be an HTTPS origin, " +
            "or an HTTP loopback origin in Development.");
    }
}
