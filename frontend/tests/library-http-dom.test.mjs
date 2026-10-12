import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const require = createRequire(import.meta.url);
const compiled = await build({ stdin: { contents: `export { LibraryRoot } from './src/features/library/LibraryRoot';
  export { LibraryProvider } from './src/features/library/LibraryProvider';
  export { LibraryThumbnail } from './src/features/library/components/LibraryThumbnail';
  export { LibraryItemViewer } from './src/features/library/components/LibraryItemViewer';
  export { LibraryUIProvider } from './src/features/library/components/LibraryUI';
  export { login } from './src/auth';`, resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', loader: { '.css': 'empty' },
  plugins: [{ name: 'shared-react', setup(builder) {
    builder.onResolve({ filter: /^(react(?:-dom)?(?:\/.*)?|lucide-react)$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const { LibraryRoot, LibraryProvider, LibraryThumbnail, LibraryItemViewer, LibraryUIProvider, login } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const NativeRequest = Request;
const stamp = '2026-10-11T10:00:00Z';
const video = (id = 'one', name = 'Persisted video') => ({ id, name, category: 'video', description: null, folderId: null,
  favorite: false, createdAt: stamp, updatedAt: stamp, deletedAt: null, processingStatus: 'available', sizeBytes: 0,
  thumbnailReference: null, tags: [], provider: 'external', videoId: null, url: 'https://example.test/video', creator: null, notes: '', folderBreadcrumb: [] });
async function fixture(run, handler) {
  const dom = new JSDOM('<body><div id="root"></div>', { url: 'http://localhost/library', pretendToBeVisual: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const names = ['window', 'document', 'HTMLElement', 'Element', 'Event', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', 'Request'];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names.slice(0, -2)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] });
  globalThis.Request = class extends NativeRequest { constructor(input, init) { super(typeof input === 'string' ? new URL(input, dom.window.location.origin) : input, init); } };
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof NativeRequest ? input : new Request(input, init); const url = new URL(request.url);
    if (url.pathname === '/api/auth/csrf') return Response.json({ token: 'csrf' });
    if (url.pathname === '/api/auth/login') return Response.json({ accessToken: 'private-access', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'owner' } });
    const text = await request.text();
    const call = { path: url.pathname, query: url.searchParams, method: request.method, body: text ? JSON.parse(text) : null, headers: request.headers, signal: request.signal };
    calls.push(call);
    const override = await handler?.(call, calls); if (override) return override;
    if (call.path.endsWith('/summary')) return Response.json({ categories: ['picture', 'document', 'video'].map(category => ({ category, itemCount: 0 })), storage: { quotaBytes: 1_000_000_000, usedBytes: 0, reservedBytes: 0, availableBytes: 1_000_000_000, entitlementSource: 'free' } });
    if (call.path.endsWith('/storage-plans')) return Response.json([{ id: 'free', name: 'Free', quotaBytes: 1_000_000_000, checkoutEnabled: false }]);
    if (call.path.endsWith('/capabilities')) return Response.json({ storageAvailable: false, checkoutEnabled: false });
    return Response.json({ items: [], nextCursor: null });
  };
  await login('owner@test.local', 'password');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const render = async tree => { await act(async () => { root.render(tree); await wait(25); }); };
  const settle = async () => { await act(async () => { await wait(40); }); };
  const click = async label => { const button = [...document.querySelectorAll('button')].find(button => button.querySelector('.wk-button-content')?.textContent.trim() === label); assert.ok(button, label); await act(async () => { button.click(); await wait(30); }); await settle(); };
  try { await run({ dom, render, settle, click, calls }); }
  finally {
    await act(async () => { root.unmount(); await wait(10); }); dom.window.close();
    for (const [name, value] of originals) { if (value) Object.defineProperty(globalThis, name, value); else delete globalThis[name]; }
  }
}
const tree = (path = '/library/videos', key = 'first') => React.createElement(LibraryRoot, { key, accountId: 'owner', path, navigate: () => {} });

test('dashboard search uses one field, survives remount, and clears back to the overview without a separate destination', () => fixture(async ({ dom, render, settle, calls }) => {
  const navigate = target => { dom.window.history.pushState(null, '', target); dom.window.dispatchEvent(new dom.window.Event('wukna:navigation')); };
  const dashboard = key => React.createElement(LibraryRoot, { key, accountId: 'owner', path: '/library', navigate });
  dom.window.history.replaceState(null, '', '/library');
  await render(dashboard('first')); await settle();
  assert.equal(document.querySelectorAll('input[aria-label="Search your library"]').length, 1);
  assert.doesNotMatch(document.querySelector('nav[aria-label="Library navigation"]').textContent, /Global Search/);
  await act(async () => {
    const input = document.querySelector('input[aria-label="Search your library"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'matching');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () => { document.querySelector('.wk-lib-header-search').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await wait(40); }); await settle();
  assert.equal(dom.window.location.pathname, '/library');
  assert.equal(new URLSearchParams(dom.window.location.search).get('search'), 'matching');
  assert.match(document.querySelector('.wk-library-search').textContent, /Results for “matching”/);
  assert.ok(calls.some(call => call.path === '/api/library/items' && call.query.get('search') === 'matching'));
  await render(dashboard('reload')); await settle();
  assert.equal(document.querySelector('input[aria-label="Search your library"]').value, 'matching');
  await act(async () => document.querySelector('button[aria-label="Clear Library header search"]').click()); await settle();
  assert.equal(dom.window.location.search, '');
  assert.ok(document.querySelector('.wk-lib-dashboard'));
  assert.equal(document.querySelector('.wk-library-search'), null);
  assert.equal(document.activeElement, document.querySelector('input[aria-label="Search your library"]'));
}));

test('default Library renders authenticated backend data and disables storage controls without preview tools', () => fixture(async ({ render, settle, calls }) => {
  await render(tree('/library/documents')); await settle();
  assert.equal(document.querySelector('.wk-library-preview-bar'), null); assert.equal(document.querySelector('.wk-library-preview-settings'), null);
  const upload = [...document.querySelectorAll('button')].find(button => button.querySelector('.wk-button-content')?.textContent.trim() === 'Uploads unavailable');
  assert.ok(upload?.disabled); assert.match(document.body.textContent, /storage is temporarily unavailable/);
  assert.ok(calls.some(call => call.path === '/api/library/items')); assert.ok(calls.every(call => call.headers.get('Authorization') === 'Bearer private-access'));
  assert.doesNotMatch(document.body.textContent, /sample-|Project reading|preview session/);
}));

test('confirmed folder creation survives a new cache and deleting the open folder returns to the category', () => {
  const folders = [];
  return fixture(async ({ render, settle, click, calls }) => {
    await render(tree()); await settle(); await click('New folder');
    await act(async () => { const input = document.querySelector('.wk-lib-form input'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, 'Saved folder'); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
    await act(async () => { document.querySelector('.wk-lib-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await wait(40); }); await settle();
    assert.equal(Boolean(document.querySelector('.wk-lib-action-dialog')), false); assert.match(document.querySelector('.wk-lib-folder-grid').textContent, /Saved folder/);
    const write = calls.find(call => call.method === 'POST'); assert.deepEqual(write.body, { name: 'Saved folder', category: 'video', parentId: null });
    await render(tree('/library/videos', 'fresh-cache')); await settle(); assert.match(document.querySelector('.wk-lib-folder-grid').textContent, /Saved folder/);
    await act(async () => { document.querySelector('.wk-lib-folder-grid button').click(); await wait(25); }); await settle();
    await click('Delete empty folder'); await click('Delete');
    assert.equal(Boolean(document.querySelector('.wk-lib-action-dialog')), false);
    assert.equal(calls.filter(call => call.path === '/api/library/items').at(-1).query.has('folderId'), false);
  }, call => {
    if (call.path === '/api/library/folders' && call.method === 'POST') { const row = { id: 'folder', ...call.body, createdAt: stamp, updatedAt: stamp }; folders.push(row); return Response.json(row, { status: 201 }); }
    if (call.path === '/api/library/folders/folder' && call.method === 'DELETE') { folders.length = 0; return new Response(null, { status: 204 }); }
    if (call.path === '/api/library/folders') return Response.json({ items: folders, nextCursor: null });
  });
});

test('favorite failure preserves server state and shows a useful conflict message', () => fixture(async ({ render, settle }) => {
  await render(tree()); await settle();
  const favorite = document.querySelector('button[aria-label="Add Persisted video to favorites"]'); assert.equal(favorite.getAttribute('aria-pressed'), 'false');
  await act(async () => { favorite.click(); await wait(35); }); await settle();
  assert.equal(favorite.getAttribute('aria-pressed'), 'false'); assert.match(document.querySelector('.wk-lib-feedback').textContent, /conflicts/);
}, call => call.path === '/api/library/items' ? Response.json({ items: [video()], nextCursor: null }) : call.method === 'PATCH' ? Response.json({ code: 'conflict' }, { status: 409 }) : null));

test('expired later-page cursor shows recovery and Retry restarts from page one', () => {
  let initialReads = 0;
  return fixture(async ({ render, settle, click, calls }) => {
    await render(tree()); await settle(); await click('Load more items');
    assert.match(document.querySelector('[role="alert"]').textContent, /expired/);
    await click('Retry'); assert.equal(document.querySelector('[role="alert"]'), null);
    assert.ok(initialReads >= 2); assert.equal(calls.filter(call => call.query.has('cursor')).length, 1);
    assert.match(document.querySelector('.wk-lib-browse').textContent, /Persisted video/);
  }, call => {
    if (call.path !== '/api/library/items') return null;
    if (call.query.has('cursor')) return Response.json({ code: 'library_invalid_cursor' }, { status: 400 });
    initialReads++; return Response.json({ items: [video()], nextCursor: 'expired-cursor' });
  });
});

test('private thumbnail DOM URLs are temporary blobs, replaced/revoked on item change and teardown', async () => {
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL; const created = [], revoked = [];
  URL.createObjectURL = blob => { assert.ok(blob instanceof Blob); const url = `blob:owned-${created.length}`; created.push(url); return url; };
  URL.revokeObjectURL = url => revoked.push(url);
  try {
    await fixture(async ({ render, settle, calls }) => {
      const imageTree = id => React.createElement(LibraryProvider, { accountId: 'owner' }, React.createElement(LibraryThumbnail, { item: { ...video(id), thumbnailReference: `https://untrusted.test/${id}` } }));
      await render(imageTree('one')); await settle(); assert.equal(document.querySelector('img').getAttribute('src'), 'blob:owned-0');
      await render(imageTree('two')); await settle(); assert.equal(document.querySelector('img').getAttribute('src'), 'blob:owned-1');
      assert.ok(revoked.includes('blob:owned-0')); assert.ok(calls.every(call => call.path.startsWith('/api/library/items/')));
    }, call => call.path.endsWith('/thumbnail') ? new Response('safe PNG fixture', { headers: { 'Content-Type': 'image/png' } }) : null);
    assert.deepEqual(revoked.sort(), created.sort());
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
});

test('processing document details keep nullable asset metadata and complete breadcrumbs without file requests', () => fixture(async ({ render, settle, calls }) => {
  const ui = { act: () => {}, open: () => {}, notify: () => {}, navigate: () => {} };
  await render(React.createElement(LibraryProvider, { accountId: 'owner' }, React.createElement(LibraryUIProvider, { value: ui }, React.createElement(LibraryItemViewer, { id: 'doc', ids: ['doc'], onChange: () => {}, onClose: () => {} })))); await settle();
  assert.match(document.querySelector('.wk-lib-details').textContent, /First \/ Deep/);
  const download = [...document.querySelectorAll('button')].find(button => button.querySelector('.wk-button-content')?.textContent.trim() === 'Download'); assert.ok(download.disabled);
  assert.equal(calls.some(call => call.path.endsWith('/content')), false); assert.match(document.body.textContent, /not ready for preview/);
}, call => call.path === '/api/library/items/doc' ? Response.json({ ...video('doc', 'Pending code.ts'), category: 'document', processingStatus: 'processing', previewKind: 'unavailable',
  contentReference: null, asset: { id: 'asset', contentType: null, checksum: null, processingStatus: 'processing', sizeBytes: 0, originalFileName: 'code.ts' },
  folderId: 'deep', folderBreadcrumb: [{ id: 'first', name: 'First' }, { id: 'deep', name: 'Deep' }] }) : null));

test('favorite changes and focus refresh metadata without requesting loaded thumbnails again', async () => {
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:cached-picture'; URL.revokeObjectURL = () => {};
  let favorite = false;
  try {
    await fixture(async ({ dom, render, settle, calls }) => {
      await render(React.createElement(LibraryProvider, { accountId: 'owner' },
        tree('/library/pictures'), React.createElement(LibraryThumbnail, { item: { ...video('picture', 'Cached picture'), category: 'picture', thumbnailReference: '/api/library/items/picture/thumbnail' } })));
      await settle();
      assert.equal(document.querySelector('.wk-lib-card img')?.getAttribute('src'), 'blob:cached-picture');
      await act(async () => document.querySelector('button[aria-label="Add Cached picture to favorites"]').click()); await settle();
      assert.equal(document.querySelector('button[aria-label="Remove Cached picture from favorites"]').getAttribute('aria-pressed'), 'true');
      await act(async () => dom.window.dispatchEvent(new dom.window.Event('focus'))); await settle();
      assert.equal(calls.filter(call => call.path.endsWith('/thumbnail')).length, 1);
      assert.ok(calls.filter(call => call.path === '/api/library/items').length >= 3);
    }, call => {
      if (call.path.endsWith('/thumbnail')) return new Response('preview', { headers: { 'Content-Type': 'image/png' } });
      if (call.method === 'PATCH') { favorite = call.body.favorite; return new Response(null, { status: 204 }); }
      if (call.path === '/api/library/items') return Response.json({ items: [{ ...video('picture', 'Cached picture'), favorite, category: 'picture', thumbnailReference: '/api/library/items/picture/thumbnail' }], nextCursor: null });
    });
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
});

test('Pictures renders one bounded page, fetches the next on demand and resets on filters', () => fixture(async ({ render, settle, calls }) => {
  await render(tree('/library/pictures')); await settle();
  assert.equal(document.querySelectorAll('.wk-lib-card').length, 24);
  assert.match(document.querySelector('.wk-lib-pagination').textContent, /Page 1/);
  assert.equal(calls.filter(call => call.query.has('cursor')).length, 0);
  await act(async () => document.querySelector('.wk-lib-select input').click());
  const next = [...document.querySelectorAll('.wk-lib-pagination button')].find(button => button.textContent.includes('Next'));
  await act(async () => next.click()); await settle();
  assert.equal(document.querySelectorAll('.wk-lib-card').length, 2);
  assert.match(document.querySelector('.wk-lib-pagination').textContent, /Page 2/);
  assert.equal(document.querySelector('.wk-lib-selection'), null);
  assert.ok(next.disabled);
  const before = calls.length;
  await act(async () => document.querySelector('.wk-lib-pagination button').click()); await settle();
  assert.equal(document.querySelectorAll('.wk-lib-card').length, 24); assert.equal(calls.length, before);
  await act(async () => next.click()); await settle();
  await act(async () => {
    const input = document.querySelector('input[aria-label="Filter Library items"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'matching');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  }); await settle();
  assert.match(document.querySelector('.wk-lib-pagination').textContent, /Page 1/);
  assert.equal(document.querySelectorAll('.wk-lib-card').length, 1);
}, call => {
  if (call.path !== '/api/library/items') return null;
  assert.equal(call.query.get('limit'), '24');
  const filtered = call.query.get('search') === 'matching', later = call.query.has('cursor');
  return Response.json({ items: Array.from({ length: filtered ? 1 : later ? 2 : 24 }, (_, index) => ({ ...video(`${later ? 'later' : 'first'}-${index}`, `Picture ${index}`), category: 'picture' })), nextCursor: filtered || later ? null : 'page-two' });
}));

test('storage displays the server account limit and keeps upgrades disabled', () => fixture(async ({ render, settle, calls }) => {
  await render(tree('/library/storage')); await settle();
  assert.match(document.body.textContent, /Free · 1.0 GB/);
  assert.doesNotMatch(document.body.textContent, /5.0 GB|Sample state|Development preview/);
  assert.equal(document.querySelector('progress').max, 1_000_000_000);
  const button = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Paid plans coming later'));
  assert.equal(button.disabled, true);
  assert.ok(calls.some(call => call.path === '/api/subscriptions/storage-plans'));
  assert.equal(calls.some(call => call.method === 'POST'), false);
}));

test('a failed next picture page keeps the current page visible and Retry restarts its cursor', () => fixture(async ({ render, settle, click, calls }) => {
  await render(tree('/library/pictures')); await settle();
  await act(async () => [...document.querySelectorAll('.wk-lib-pagination button')].find(button => button.textContent.includes('Next')).click()); await settle();
  assert.match(document.querySelector('[role="alert"]').textContent, /expired/);
  assert.equal(document.querySelectorAll('.wk-lib-card').length, 1);
  assert.match(document.querySelector('.wk-lib-pagination').textContent, /Page 1/);
  await click('Retry');
  assert.equal(document.querySelector('[role="alert"]'), null);
  assert.equal(document.querySelectorAll('.wk-lib-card').length, 1);
  assert.equal(calls.filter(call => call.query.has('cursor')).length, 1);
}, call => call.path === '/api/library/items' ? call.query.has('cursor')
  ? Response.json({ code: 'library_invalid_cursor' }, { status: 400 })
  : Response.json({ items: [{ ...video('picture', 'Visible picture'), category: 'picture' }], nextCursor: 'expired' }) : null));
