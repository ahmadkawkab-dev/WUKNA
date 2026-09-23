using Xunit;
using Xunit.Sdk;
using Xunit.v3;

[assembly: AssemblyFixture(typeof(Wukna.IntegrationTests.PostgresFixture))]
[assembly: Parallelization(Mode = ParallelMode.None)]
