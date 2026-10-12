# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["Wukna.csproj", "Directory.Build.props", "global.json", "./"]
RUN dotnet restore "Wukna.csproj"
COPY . .
RUN --mount=type=secret,id=sixlabors_license,required=true \
    dotnet publish "Wukna.csproj" --configuration Release --output /app/publish --no-restore \
    /p:UseAppHost=false /p:SixLaborsLicenseFile=/run/secrets/sixlabors_license

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
RUN mkdir -p /app/App_Data/profile-images /app/App_Data/data-protection-keys /app/App_Data/chat-attachments /app/App_Data/library-quarantine \
    && chown -R app:app /app/App_Data \
    && chmod 700 /app/App_Data/data-protection-keys /app/App_Data/chat-attachments /app/App_Data/library-quarantine
USER app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Wukna.dll"]
