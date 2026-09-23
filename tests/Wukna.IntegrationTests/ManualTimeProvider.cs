namespace Wukna.IntegrationTests;

public sealed class ManualTimeProvider(DateTimeOffset initial) : TimeProvider
{
    private DateTimeOffset current = initial;

    public override DateTimeOffset GetUtcNow() => current;

    public DateTimeOffset Advance(TimeSpan amount) => current = current.Add(amount);
}
