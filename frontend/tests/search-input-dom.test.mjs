import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const require = createRequire(import.meta.url);
const compiled = await build({ stdin: { contents: `export { SearchInput } from './src/components/ui/SearchInput';`, resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', loader: { '.css': 'empty' },
  plugins: [{ name: 'search-react', setup(builder) {
    builder.onResolve({ filter: /^(react(?:\/.*)?|lucide-react)$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const { SearchInput } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

test('clear search resets text and submitted state, restores forwarded input focus, and never submits its form', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')), ref = React.createRef();
  let submissions = 0, clearEvents = 0;
  function SearchForm() {
    const [value, setValue] = React.useState('saved query');
    const [submitted, setSubmitted] = React.useState('saved query');
    return React.createElement('form', { onSubmit: event => { event.preventDefault(); submissions += 1; } },
      React.createElement(SearchInput, { ref, value, onValueChange: setValue, clearLabel: 'Clear search', 'aria-label': 'Search',
        onClear: () => { clearEvents += 1; setSubmitted(''); } }),
      React.createElement('p', null, submitted || 'Recently added items'));
  }
  try {
    await act(async () => root.render(React.createElement(SearchForm)));
    assert.equal(ref.current, document.querySelector('input'));
    await act(async () => document.querySelector('button[aria-label="Clear search"]').click());
    assert.equal(ref.current.value, '');
    assert.equal(document.activeElement, ref.current);
    assert.equal(document.querySelector('button[aria-label="Clear search"]'), null);
    assert.equal(document.querySelector('p').textContent, 'Recently added items');
    assert.equal(clearEvents, 1);
    assert.equal(submissions, 0);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [name, previous] of originals) { if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name]; }
  }
});
