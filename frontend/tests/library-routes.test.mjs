import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `export * from './src/features/library/libraryRoutes';`,
    resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { libraryDashboardPath, libraryDestinations, libraryRoute, safeLibraryReturnPath, isLibraryPath } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
test('eight Library destinations and the legacy search alias retain safe exact local return paths', () => {
  assert.equal(libraryDestinations.length, 8);
  assert.equal(libraryDestinations.some(destination => destination.label === 'Global Search'), false);
  assert.equal(libraryRoute('/library/search').section, 'dashboard');
  assert.equal(safeLibraryReturnPath('/library/search'), '/library');
  assert.equal(libraryRoute('/library/snippets'), null);
  for (const route of libraryDestinations) {
    assert.equal(libraryRoute(route.path).section, route.section);
    assert.equal(safeLibraryReturnPath(route.path), route.path);
  }
  for (const path of ['https://evil.test/library', '//evil.test/library', '/library?next=//evil.test', '/library-old', '/library/unknown', '/library/../boards']) {
    assert.equal(safeLibraryReturnPath(path), null);
    assert.equal(libraryRoute(path), null);
  }
  assert.equal(isLibraryPath('/library/unknown'), true);
  assert.equal(isLibraryPath('/library-old'), false);
});

test('dashboard search links encode terms and keep all recent items within the dashboard', () => {
  assert.equal(libraryDashboardPath(), '/library');
  assert.equal(libraryDashboardPath('', true), '/library?view=all');
  const path = libraryDashboardPath('  a & b/code?  ');
  assert.equal(new URL(path, 'https://example.test').pathname, '/library');
  assert.equal(new URL(path, 'https://example.test').searchParams.get('search'), 'a & b/code?');
  assert.equal(new URL(libraryDashboardPath('x'.repeat(300)), 'https://example.test').searchParams.get('search').length, 200);
});

