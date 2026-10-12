import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const require = createRequire(import.meta.url);
const compiled = await build({
  stdin: { contents: `export { StorageMeter } from './src/features/library/components/StorageMeter';
    export { AppShell } from './src/components/navigation/AppShell';
    export { LibraryRoot } from './src/features/library/LibraryRoot';
    export { LibraryProvider } from './src/features/library/LibraryProvider';
    export { LibraryShell } from './src/features/library/components/LibraryShell';
    export { LibrarySearch } from './src/features/library/components/LibrarySearch';
    export { LibraryStorage } from './src/features/library/views/LibraryStorage';
    export { LibraryUIProvider } from './src/features/library/components/LibraryUI';
    export { LibraryNavigation, LibraryCollectionShortcuts } from './src/features/library/components/LibraryNavigation';
    export { CodeDocumentViewer } from './src/features/library/documents/CodeDocumentViewer';
    export { useLibraryItems } from './src/features/library/hooks/useLibraryQueries';`, resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', loader: { '.css': 'empty' },
  plugins: [{ name: 'library-dom-react', setup(builder) {
    builder.onResolve({ filter: /^(react(?:-dom)?(?:\/.*)?|lucide-react)$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const { AppShell, StorageMeter, LibraryRoot, LibraryProvider, LibraryShell, LibraryStorage, LibraryUIProvider, LibraryNavigation, LibraryCollectionShortcuts, useLibraryItems, CodeDocumentViewer } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function withDom(run) {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/library', pretendToBeVisual: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const names = ['window', 'document', 'sessionStorage', 'Node', 'HTMLElement', 'Element', 'Event', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] });
  const root = createRoot(document.getElementById('root'));
  const render = async element => { await act(async () => { root.render(element); await wait(20); }); };
  const settle = async (ms = 220) => { await act(async () => { await wait(ms); }); };
  try { await run({ dom, root, render, settle }); }
  finally { await act(async () => root.unmount()); dom.window.close(); for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } }
}

// Component fixtures live only in this test file; application adapters never seed items.
const stamp = '2026-10-11T10:00:00Z';
const rows = Array.from({ length: 3 }, (_, i) => ({ id: `picture-${i}`, category: 'picture', name: `Stored picture ${i}.png`, description: null, folderId: null, favorite: false, createdAt: stamp, updatedAt: stamp, deletedAt: null, processingStatus: 'available', sizeBytes: 100, thumbnailReference: null }));
const plans = [{ id: 'free', name: 'Free', quotaBytes: 1_000_000_000, checkoutEnabled: false }, { id: 'plus', name: 'Plus', quotaBytes: 100_000_000_000, checkoutEnabled: false }];
const readApi = () => ({
  capabilities: async () => ({ storageAvailable: false, checkoutEnabled: false }),
  storagePlans: async () => plans,
  summary: async () => ({ categories: ['picture', 'document', 'video'].map(category => ({ category, itemCount: category === 'picture' ? 3 : 0 })), storage: { quotaBytes: 1_000_000_000, usedBytes: 300, reservedBytes: 0, availableBytes: 999_999_700, entitlementSource: 'free' } }),
  items: async query => ({ items: !query.category || query.category === 'picture' ? rows : [], nextCursor: null }),
  folders: async () => ({ items: [], nextCursor: null }),
  collections: async () => ({ items: [{ id: 'collection', name: 'Stored collection', description: null, itemCount: 3, createdAt: stamp, updatedAt: stamp }], nextCursor: null }),
});
const rootTree = props => React.createElement(LibraryProvider, { accountId: props.accountId, createApi: readApi }, React.createElement(LibraryRoot, props));

async function uploadFixture(run, addFile, path = '/library/pictures', names = ['first.png', 'second.png']) {
  return withDom(async ({ dom, render, settle }) => {
    const api = { ...readApi(), capabilities: async () => ({ storageAvailable: true, checkoutEnabled: false }), addFile };
    await render(React.createElement(LibraryProvider, { accountId: 'upload-owner', createApi: () => api },
      React.createElement(LibraryRoot, { accountId: 'upload-owner', path, navigate: () => {} })));
    await settle();
    const click = async label => {
      const button = [...document.querySelectorAll('button')].find(button => button.querySelector('.wk-button-content')?.textContent.trim() === label);
      assert.ok(button, label);
      await act(async () => button.click()); await settle(30);
    };
    await click('Upload');
    await act(async () => {
      const input = document.querySelector('input[type="file"]');
      Object.defineProperty(input, 'files', { configurable: true, value: names.map(name => new dom.window.File(['file'], name)) });
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await run({ click, settle });
  });
}

test('Dashboard Upload includes JPG and PNG in the chooser and routes a mixed batch into Pictures and Documents', async () => {
  const uploaded = [];
  await uploadFixture(async ({ click, settle }) => {
    const accept = document.querySelector('input[type="file"]').accept.split(',');
    for (const type of ['image/jpeg', 'image/png', '.jpg', '.JPG', '.png', '.PNG', '.ts']) assert.ok(accept.includes(type), type);
    await click('Upload files'); await settle(100);
    assert.deepEqual(uploaded, [
      { name: 'photo.jpg', category: 'picture', folderId: null },
      { name: 'diagram.PNG', category: 'picture', folderId: null },
      { name: 'notes.ts', category: 'document', folderId: null },
    ]);
    assert.equal(document.querySelector('.wk-lib-action-dialog'), null);
    assert.match(document.querySelector('.wk-lib-feedback').textContent, /3 files saved to Library/);
  }, async ({ file, category, folderId }) => { uploaded.push({ name: file.name, category, folderId }); }, '/library', ['photo.jpg', 'diagram.PNG', 'notes.ts']);
});

test('the upload dialog closes only after the last selected file is confirmed and preserves the success notice', async () => {
  const pending = [], names = [];
  await uploadFixture(async ({ click, settle }) => {
    await click('Upload files');
    assert.ok(document.querySelector('.wk-lib-action-dialog'));
    assert.deepEqual(names, ['first.png']);
    assert.equal(document.querySelector('button[aria-label="Remove second.png from queue"]').disabled, true, 'queue edits cannot shift an active batch');
    await act(async () => pending.shift()()); await settle(30);
    assert.ok(document.querySelector('.wk-lib-action-dialog'), 'the first completed file does not close a multi-file queue');
    assert.deepEqual(names, ['first.png', 'second.png']);
    await act(async () => pending.shift()()); await settle(30);
    assert.equal(document.querySelector('.wk-lib-action-dialog'), null);
    assert.match(document.querySelector('.wk-lib-feedback').textContent, /2 files saved to Library/);
  }, async ({ file }) => { names.push(file.name); await new Promise(resolve => pending.push(resolve)); });
});

test('dropping a picture onto its Dashboard panel uploads automatically and closes on readiness', () => withDom(async ({ dom, render, settle }) => {
  const captured = [];
  const api = { ...readApi(), capabilities: async () => ({ storageAvailable: true }), addFile: async input => { captured.push(input); } };
  await render(React.createElement(LibraryProvider, { accountId: 'drop-owner', createApi: () => api }, React.createElement(LibraryRoot, { accountId: 'drop-owner', path: '/library', navigate: () => {} }))); await settle();
  const file = new dom.window.File(['image'], 'dropped.png');
  const event = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file], types: ['Files'], getData: () => '' } });
  await act(async () => document.querySelector('.wk-lib-category-grid button').dispatchEvent(event)); await settle(120);
  assert.equal(captured.length, 1); assert.equal(captured[0].file, file); assert.equal(captured[0].category, 'picture');
  assert.equal(document.querySelector('.wk-lib-action-dialog'), null);
  assert.match(document.querySelector('.wk-lib-feedback').textContent, /1 file saved/);
}));

test('dropping a video link saves automatically without requiring file storage', () => withDom(async ({ dom, render, settle }) => {
  const captured = [];
  const api = { ...readApi(), addVideo: async input => { captured.push(input); } };
  await render(React.createElement(LibraryProvider, { accountId: 'drop-owner', createApi: () => api }, React.createElement(LibraryRoot, { accountId: 'drop-owner', path: '/library/videos', navigate: () => {} }))); await settle();
  const event = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [], types: ['text/plain'], getData: () => 'https://youtu.be/aqz-KE-bpKQ' } });
  await act(async () => document.querySelector('.wk-lib-browse').dispatchEvent(event)); await settle(120);
  assert.equal(captured.length, 1); assert.equal(captured[0].url, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  assert.equal(document.querySelector('.wk-lib-action-dialog'), null);
  assert.match(document.querySelector('.wk-lib-feedback').textContent, /Video link saved/);
}));

test('an incoming share survives initial route reset and saves once under StrictMode', () => withDom(async ({ render, settle }) => {
  const captured = [];
  sessionStorage.setItem('wukna.library.shared-video', JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', name: 'Incoming video', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', createdAt: Date.now() }));
  const api = { ...readApi(), addVideo: async input => { captured.push(input); } };
  await render(React.createElement(React.StrictMode, null, React.createElement(LibraryProvider, { accountId: 'share-owner', createApi: () => api }, React.createElement(LibraryRoot, { accountId: 'share-owner', path: '/library/videos', navigate: () => {} })))); await settle(200);
  assert.equal(captured.length, 1); assert.equal(captured[0].name, 'Incoming video');
  assert.equal(document.querySelector('.wk-lib-action-dialog'), null);
  assert.equal(sessionStorage.getItem('wukna.library.shared-video'), null);
}));

test('removing a queued file excludes it from upload and keeps keyboard focus on the file chooser', async () => {
  const names = [];
  await uploadFixture(async ({ click }) => {
    await act(async () => document.querySelector('button[aria-label="Remove first.png from queue"]').click());
    assert.equal(document.querySelectorAll('.wk-lib-upload-queue li').length, 1);
    assert.doesNotMatch(document.querySelector('.wk-lib-upload-queue').textContent, /first.png/);
    assert.equal(document.activeElement, document.querySelector('input[type="file"]'));
    await click('Upload files');
    assert.deepEqual(names, ['second.png']);
    assert.equal(document.querySelector('.wk-lib-action-dialog'), null);
  }, async ({ file }) => { names.push(file.name); });
});

test('removing every queued file disables uploading without submitting or closing the dialog', async () => {
  const names = [];
  await uploadFixture(async () => {
    for (const name of ['first.png', 'second.png']) {
      const button = document.querySelector(`button[aria-label="Remove ${name} from queue"]`);
      assert.equal(button.type, 'button');
      await act(async () => button.click());
    }
    assert.equal(document.querySelectorAll('.wk-lib-upload-queue li').length, 0);
    assert.equal(document.querySelector('.wk-lib-form button[type="submit"]').disabled, true);
    assert.ok(document.querySelector('.wk-lib-action-dialog'));
    assert.deepEqual(names, []);
  }, async ({ file }) => { names.push(file.name); });
});

test('a failed file can be removed from the retry queue while completed files stay saved', async () => {
  await uploadFixture(async ({ click }) => {
    await click('Upload files');
    assert.equal(document.querySelector('button[aria-label="Remove first.png from queue"]'), null);
    await act(async () => document.querySelector('button[aria-label="Remove second.png from queue"]').click());
    assert.equal(document.querySelectorAll('.wk-lib-upload-queue li').length, 1);
    assert.match(document.querySelector('.wk-lib-upload-queue').textContent, /first.pngAdded/);
    assert.equal(document.querySelector('.wk-lib-form button[type="submit"]').disabled, true);
  }, async ({ file }) => { if (file.name === 'second.png') throw new Error('controlled upload failure'); });
});

test('partial upload failure stays open and a successful retry closes without uploading completed files again', async () => {
  const names = []; let fail = true;
  await uploadFixture(async ({ click }) => {
    await click('Upload files');
    assert.ok(document.querySelector('.wk-lib-action-dialog'));
    assert.match(document.querySelector('.wk-lib-upload-queue').textContent, /controlled upload failure/);
    assert.match(document.querySelector('.wk-lib-feedback').textContent, /1 file saved to Library/);
    fail = false; await click('Retry remaining files');
    assert.equal(document.querySelector('.wk-lib-action-dialog'), null);
    assert.deepEqual(names, ['first.png', 'second.png', 'second.png']);
  }, async ({ file }) => { names.push(file.name); if (file.name === 'second.png' && fail) throw new Error('controlled upload failure'); });
});

test('cancelling an upload leaves the dialog and remaining files available for retry', async () => {
  await uploadFixture(async ({ click }) => {
    await click('Upload files');
    await click('Cancel remaining');
    assert.ok(document.querySelector('.wk-lib-action-dialog'));
    assert.match(document.querySelector('.wk-lib-upload-queue').textContent, /Upload cancelled.*Queued/);
  }, async (_input, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })));
});

test('shell exposes all destinations, active page, breadcrumbs, disclosure and picture content', () => withDom(async ({ render, settle }) => {
  const destinations = [];
  await render(rootTree({ accountId: 'account-a', path: '/library/pictures', navigate: path => destinations.push(path) }));
  await settle();
  for (let attempts = 0; attempts < 10 && document.querySelectorAll('.wk-lib-card').length === 0; attempts++) await settle(100);
  const nav = document.querySelector('nav[aria-label="Library navigation"]');
  assert.equal(nav.querySelectorAll('button').length, 7);
  assert.equal(nav.querySelector('[aria-current="page"] span').textContent, 'Pictures');
  assert.match(document.querySelector('h1').textContent, /Pictures/);
  assert.doesNotMatch(document.body.textContent, /Development preview|Sample state/);
  assert.equal(document.querySelectorAll('.wk-lib-card').length, 3);
  assert.equal(document.querySelectorAll('.wk-lib-card img').length, 0);
  await act(async () => { nav.querySelectorAll('button')[1].click(); document.querySelector('.wk-library-breadcrumbs button').click(); });
  assert.deepEqual(destinations, ['/library/pictures', '/library']);
  assert.equal([...nav.querySelectorAll('span')].some(node => node.textContent === 'Storage Management'), false);
}));

test('new account uses fresh state, aborts old reads, and cannot display delayed old-account data', () => withDom(async ({ render, settle }) => {
  const requests = [];
  const createApi = accountId => ({ summary: signal => new Promise(resolve => {
    requests.push({ accountId, signal });
    setTimeout(() => resolve({ categories: [], storage: { quotaBytes: 1_000_000_000, usedBytes: accountId === 'old' ? 900 : 100,
      reservedBytes: 0, availableBytes: 1_000_000_000, entitlementSource: 'free' } }), accountId === 'old' ? 130 : 5);
  }) });
  const tree = accountId => React.createElement(LibraryProvider, { accountId, createApi }, React.createElement(LibraryShell, { path: '/library', navigate: () => {} }, React.createElement(StorageMeter)));
  await render(tree('old'));
  await render(tree('new'));
  await settle(180);
  assert.equal(requests.find(request => request.accountId === 'old').signal.aborted, true);
  assert.match(document.querySelector('.wk-library-storage').textContent, /100 bytes used/);
  assert.doesNotMatch(document.body.textContent, /900 bytes/);
}));

test('failed summary has a working retry and shares one request between navigation and storage', () => withDom(async ({ render, settle }) => {
  let calls = 0;
  const createApi = () => ({ summary: async () => {
    if (++calls === 1) throw new Error('transient');
    return { categories: [], storage: { quotaBytes: 1_000_000_000, usedBytes: 0, reservedBytes: 0, availableBytes: 1_000_000_000, entitlementSource: 'free' } };
  } });
  await render(React.createElement(LibraryProvider, { accountId: 'a', createApi }, React.createElement(LibraryShell, { path: '/library', navigate: () => {} }, React.createElement(StorageMeter))));
  await settle(20);
  assert.equal(calls, 1);
  assert.match(document.querySelector('[role="alert"]').textContent, /transient/);
  await act(async () => { document.querySelector('.wk-library-storage button').click(); await wait(20); });
  await settle(20);
  assert.equal(calls, 2);
  assert.equal(document.querySelector('[role="alert"]'), null);
  assert.ok(document.querySelector('progress'));
}));

test('search switches query caches so an old response never replaces the current results', () => withDom(async ({ render, settle }) => {
  const requests = [];
  const createApi = () => ({ items: (query, signal) => new Promise(resolve => {
    requests.push({ term: query.search, signal });
    setTimeout(() => resolve({ items: [{ id: query.search, name: query.search, category: 'document', description: null }], nextCursor: null }), query.search === 'old' ? 100 : 5);
  }) });
  function Results({ term }) {
    const results = useLibraryItems({ search: term });
    return React.createElement('p', { className: 'wk-library-results' }, results.data?.pages.flatMap(page => page.items).map(item => item.name).join(',') ?? 'Loading');
  }
  const tree = term => React.createElement(LibraryProvider, { accountId: 'a', createApi }, React.createElement(Results, { term }));
  await render(tree('old')); await render(tree('new')); await settle(150);
  assert.match(document.querySelector('.wk-library-results').textContent, /new/);
  assert.doesNotMatch(document.querySelector('.wk-library-results').textContent, /old/);
  assert.equal(requests.find(request => request.term === 'old').signal.aborted, true);
}));

test('development StrictMode replay keeps Library queries usable', () => withDom(async ({ render, settle }) => {
  await render(React.createElement(React.StrictMode, null, rootTree({ accountId: 'strict-account', path: '/library', navigate: () => {} })));
  await settle(260);
  assert.equal(document.querySelectorAll('.wk-lib-category-grid > button').length, 3);
  assert.equal(document.querySelector('[role="alert"]'), null);
}));

test('Storage charges reserved space, warns at 92%, keeps checkout disabled and links to Trash', () => withDom(async ({ render, settle }) => {
  const destinations = [];
  const createApi = () => ({ summary: async () => ({ categories: [], storage: { quotaBytes: 1_000_000_000, usedBytes: 900_000_000, reservedBytes: 20_000_000, availableBytes: 80_000_000, entitlementSource: 'free' } }),
    storagePlans: async () => plans, items: async () => ({ items: [], nextCursor: null }), folders: async () => ({ items: [], nextCursor: null }) });
  const ui = { act: () => {}, open: () => {}, notify: () => {}, navigate: path => destinations.push(path) };
  await render(React.createElement(LibraryProvider, { accountId: 'a', createApi }, React.createElement(LibraryUIProvider, { value: ui }, React.createElement(LibraryStorage)))); await settle(20);
  assert.match(document.querySelector('.wk-lib-quota-warning').textContent, /92%/);
  assert.equal(document.querySelector('progress').value, 920_000_000);
  const button = text => [...document.querySelectorAll('button')].find(item => item.querySelector('.wk-button-content')?.textContent === text);
  assert.equal(button('Paid plans coming later').disabled, true);
  await act(async () => button('Review Trash').click()); assert.deepEqual(destinations, ['/library/trash']);
}));

test('code document viewer treats HTML/script source as text and exposes read-only controls', () => withDom(async ({ render }) => {
  const source = '<script>window.executed = true</script>\n<img src=x onerror="alert(1)">';
  await render(React.createElement(CodeDocumentViewer, { name: 'unsafe.txt', source, language: 'plaintext' }));
  assert.equal(document.querySelector('.wk-code-source script'), null);
  assert.equal(document.querySelector('.wk-code-source img'), null);
  assert.match(document.querySelector('.wk-code-source').textContent, /<script>/);
  assert.equal(window.executed, undefined);
  assert.match(document.body.textContent, /Read-only document/);
  assert.equal(document.querySelectorAll('.wk-code-line-number').length, 2);
  assert.ok([...document.querySelectorAll('button .wk-button-content')].some(content => content.textContent === 'Copy code'));
}));


test('Library navigation uses the shared sidebar and storage remains below Notifications across workspace routes', () => withDom(async ({ dom, render, settle }) => {
  dom.window.matchMedia = query => Object.assign(new dom.window.EventTarget(), { matches: !query.includes('max-width'), media: query });
  dom.window.scrollTo = () => {};
  function Workspace() {
    const [path, setPath] = React.useState('/library/pictures');
    const navigate = target => { dom.window.history.pushState({}, '', target); setPath(new URL(target, dom.window.location.origin).pathname); dom.window.dispatchEvent(new dom.window.Event('wukna:navigation')); };
    const noop = async () => {};
    return React.createElement(LibraryProvider, { accountId: 'a', createApi: readApi }, React.createElement(AppShell, { renderLibraryNavigation: go => React.createElement('div', { className: 'wk-library-rail' }, React.createElement(LibraryNavigation, { section: path === '/library/pictures' ? 'pictures' : null, navigate: go }), React.createElement(LibraryCollectionShortcuts, { navigate: go, onCollection: id => go(`/library/collections?collection=${id}`) })), renderLibraryStorage: () => React.createElement('div', { className: 'wk-sidebar-storage' }, React.createElement(StorageMeter, { compact: true })), libraryEnabled: true, user: { id: 'a', username: 'a', email: 'a@example.test' }, boards: [], activeBoardId: null,
      navigate, onCreateBoard: noop, onRenameBoard: noop, onDeleteBoard: noop, onColorBoard: noop, onOpenAccount: noop, signOut: noop, signOutEverywhere: noop, notify: () => {},
      children: path.startsWith('/library') ? React.createElement(LibraryRoot, { accountId: 'a', path, navigate }) : React.createElement('h1', null, 'Home') }));
  }
  await render(React.createElement(Workspace)); await settle();
  assert.equal(document.querySelectorAll('nav[aria-label="Library navigation"]').length, 1);
  assert.ok(document.querySelector('.wk-sidebar nav[aria-label="Library navigation"]'));
  assert.equal(document.querySelector('.wk-library-layout > aside'), null);
  const primary = [...document.querySelectorAll('.wk-sidebar-primary-links > button, .wk-sidebar-bottom > button')];
  assert.deepEqual(primary.slice(0, 3).map(button => button.getAttribute('aria-label')), ['Home', 'Boards', 'Library']);
  assert.equal(primary.at(-1).getAttribute('aria-label'), 'Notifications');
  assert.equal(document.querySelector('.wk-sidebar-bottom > button').nextElementSibling.className, 'wk-sidebar-storage');
  assert.equal(document.querySelector('.wk-sidebar-storage progress').max, 1_000_000_000);
  const selection = document.querySelector('.wk-lib-select input');
  await act(async () => selection.click());
  assert.equal(selection.checked, true);
  const libraryToggle = document.querySelector('.wk-sidebar button[aria-label="Library"]');
  await act(async () => libraryToggle.click());
  assert.equal(libraryToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(document.querySelector('#wk-sidebar-library-sections').getAttribute('inert'), '');
  assert.equal(document.querySelector('#wk-sidebar-library-sections').getAttribute('data-open'), 'false');
  assert.equal(document.querySelector('h1').textContent, 'Pictures');
  assert.equal(document.querySelector('.wk-lib-select input').checked, true);
  assert.ok(document.querySelector('.wk-sidebar-storage progress'));
  assert.equal(document.querySelector('.wk-library-layout > aside'), null);
  await act(async () => libraryToggle.click());
  assert.equal(libraryToggle.getAttribute('aria-expanded'), 'true');
  assert.equal(document.querySelector('#wk-sidebar-library-sections').hasAttribute('inert'), false);
  const shortcut = document.querySelector('.wk-library-collection-shortcuts button');
  await act(async () => { shortcut.click(); await wait(250); });
  assert.match(document.querySelector('.wk-lib-collections').textContent, /Stored collection/);
  assert.match(document.querySelector('.wk-lib-collections').textContent, /Edit collection/);
  await act(async () => { document.querySelector('button[aria-label="Home"]').click(); await wait(35); });
  assert.equal(document.querySelector('.wk-library'), null);
  assert.ok(document.querySelector('.wk-sidebar nav[aria-label="Library navigation"]'));
  assert.equal(libraryToggle.getAttribute('aria-expanded'), 'true');
  await act(async () => libraryToggle.click());
  assert.equal(libraryToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(document.querySelector('h1').textContent, 'Home', 'closing the menu does not navigate away');
  await act(async () => libraryToggle.click()); await settle();
  assert.equal(libraryToggle.getAttribute('aria-expanded'), 'true');
  assert.equal(document.querySelector('h1').textContent, 'Dashboard');
  assert.ok(document.querySelector('.wk-sidebar-storage progress'));
  assert.equal(document.querySelector('.wk-sidebar-bottom > button').nextElementSibling.className, 'wk-sidebar-storage');
}));

test('empty dashboard has one empty state and one set of capture actions', () => withDom(async ({ render, settle }) => {
  const createApi = () => ({ ...readApi(), items: async () => ({ items: [], nextCursor: null }), collections: async () => ({ items: [], nextCursor: null }) });
  await render(React.createElement(LibraryProvider, { accountId: 'empty', createApi }, React.createElement(LibraryRoot, { accountId: 'empty', path: '/library', navigate: () => {} })));
  await settle();
  const dashboard = document.querySelector('.wk-lib-dashboard');
  assert.equal(dashboard.querySelectorAll('.wk-lib-state').length, 1);
  assert.match(dashboard.textContent, /Start your library/);
  assert.doesNotMatch(dashboard.textContent, /Quick capture|Keep favorites close|Bring related items together/);
  assert.equal(dashboard.querySelectorAll('.wk-lib-section-heading .wk-button').length, 2);
}));

test('mobile Library sections stay open across destinations, then close by toggle or Escape', () => withDom(async ({ dom, render, settle }) => {
  dom.window.matchMedia = query => Object.assign(new dom.window.EventTarget(), { matches: false, media: query });
  function Workspace() {
    const [path, setPath] = React.useState('/library/pictures');
    return React.createElement(LibraryProvider, { accountId: 'mobile', createApi: readApi }, React.createElement(LibraryRoot, { accountId: 'mobile', path, navigate: setPath }));
  }
  await render(React.createElement(Workspace)); await settle();
  const toggle = document.querySelector('.wk-library-section-menu > button');
  await act(async () => toggle.click());
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  const menu = document.getElementById(toggle.getAttribute('aria-controls'));
  await act(async () => document.querySelector('.wk-library-navigation button:nth-child(3)').click()); await settle();
  assert.equal(document.querySelector('h1').textContent, 'Documents');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  await act(async () => toggle.click());
  assert.equal(menu.hasAttribute('inert'), true);
  await act(async () => { toggle.click(); });
  await act(async () => { document.querySelector('.wk-library-navigation button').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, toggle);
}));
