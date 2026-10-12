import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `export * from './src/features/library/libraryRoutes';`,
    resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { libraryDestinations, libraryRoute, safeLibraryReturnPath, isLibraryPath } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
test('all nine Library routes are exact local destinations and return paths reject open redirects', () => {
  assert.equal(libraryDestinations.length, 9);
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

