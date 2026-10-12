import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const output = await build({ stdin: { contents: `export { createHttpLibraryApi } from './src/features/library/api/createHttpLibraryApi';
  export { login, currentSession, setSessionExpiredHandler } from './src/auth';
  export { libraryErrorMessage, LibraryApiError } from './src/features/library/contracts';`,
  resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { createHttpLibraryApi, login, currentSession, setSessionExpiredHandler, libraryErrorMessage, LibraryApiError } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const NativeRequest = globalThis.Request;
const signal = () => new AbortController().signal;
const origin = 'https://wukna.test';
const session = (id = 'owner', token = 'access') => ({ accessToken: token, expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id } });
async function fixture(handler, owner = 'owner') {
  const calls = [];
  globalThis.window = { location: { origin } };
  globalThis.Request = class extends NativeRequest { constructor(input, init) { super(typeof input === 'string' ? new URL(input, origin) : input, init); } };
  globalThis.fetch = async (input, init) => {
    const request = input instanceof NativeRequest ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname === '/api/auth/csrf') return Response.json({ token: 'csrf' });
    if (url.pathname === '/api/auth/login') return Response.json(session(owner));
    const call = { path: url.pathname, query: url.searchParams, method: request.method, headers: request.headers,
      cache: request.cache, signal: request.signal, body: await request.text(), credentials: request.credentials };
    calls.push(call); return handler(call, calls);
  };
  await login('test@example.test', 'test-password');
  return { api: createHttpLibraryApi(owner), calls };
}

test('real query encoding preserves roots, false, opaque cursors and account authentication', async () => {
  const { api, calls } = await fixture(() => Response.json({ items: [], nextCursor: null }));
  await api.items({ folderId: null, favorite: false, trash: true, search: '100% _ & café', cursor: 'a+/= ?&', limit: 24 }, signal());
  const call = calls[0];
  assert.equal(call.path, '/api/library/items'); assert.equal(call.query.get('folderId'), 'root');
  assert.equal(call.query.get('favorite'), 'false'); assert.equal(call.query.get('trash'), 'true');
  assert.equal(call.query.get('search'), '100% _ & café'); assert.equal(call.query.get('cursor'), 'a+/= ?&');
  assert.equal(call.headers.get('Authorization'), 'Bearer access'); assert.equal(call.credentials, 'include'); assert.equal(call.cache, 'no-store');
  await api.items({ cursor: null }, signal()); assert.equal(calls[1].query.size, 0);
  await api.folders({ parentId: null, category: 'document' }, signal()); assert.equal(calls[2].query.get('parentId'), 'root');
  await api.collections(null, 100, signal()); assert.equal(calls[3].query.get('cursor'), null);
  api.dispose();
});

test('storage plans use the authenticated subscription boundary and do not create checkout', async () => {
  const plans = [{ id: 'free', name: 'Free', quotaBytes: 1_000_000_000, checkoutEnabled: false }, { id: 'plus', name: 'Plus', quotaBytes: 100_000_000_000, checkoutEnabled: false }];
  const { api, calls } = await fixture(() => Response.json(plans));
  assert.deepEqual(await api.storagePlans(signal()), plans);
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/api/subscriptions/storage-plans');
  assert.equal(calls[0].method, 'GET'); assert.equal(calls[0].headers.get('Authorization'), 'Bearer access');
  assert.equal(calls[0].cache, 'no-store'); api.dispose();
});

test('all metadata mutations use the backend methods and exact bounded command envelopes', async () => {
  const { api, calls } = await fixture(() => new Response(null, { status: 204 }));
  await api.updateItems(['one'], { favorite: false, description: null, folderId: null }, signal());
  await api.updateItems(['one', 'two'], { name: 'New name' }, signal());
  await api.trashItems(['one'], signal()); await api.restoreItems(['one'], signal()); await api.deleteItems(['one'], signal());
  await api.updateCollection('collection', { name: 'Saved', description: null }, signal());
  await api.deleteCollection('collection', signal()); await api.deleteFolder('folder', signal());
  await api.collectionItems('collection', ['one'], 'add', signal()); await api.collectionItems('collection', ['one'], 'remove', signal());
  assert.deepEqual(calls.map(call => [call.method, call.path]), [
    ['PATCH', '/api/library/items/one'], ['POST', '/api/library/items/bulk-update'], ['POST', '/api/library/items/trash'],
    ['POST', '/api/library/items/restore'], ['POST', '/api/library/items/purge'], ['PUT', '/api/library/collections/collection'],
    ['DELETE', '/api/library/collections/collection'], ['DELETE', '/api/library/folders/folder'],
    ['POST', '/api/library/collections/collection/items/add'], ['POST', '/api/library/collections/collection/items/remove'],
  ]);
  assert.deepEqual(JSON.parse(calls[0].body), { favorite: false, description: null, folderId: null });
  assert.deepEqual(JSON.parse(calls[1].body), { ids: ['one', 'two'], update: { name: 'New name' } });
  assert.deepEqual(JSON.parse(calls[8].body), { itemIds: ['one'] });
  api.dispose();
});

test('reads and creates return wire DTOs including nullable assets and provider metadata', async () => {
  const dto = { id: 'id', asset: { contentType: null, checksum: null }, folderBreadcrumb: [], metadataErrorCode: 'library_video_metadata_unavailable' };
  const { api, calls } = await fixture(() => Response.json(dto));
  for (const operation of [() => api.summary(signal()), () => api.capabilities(signal()), () => api.item('id', signal()),
    () => api.createFolder({ name: 'Folder', category: 'video', parentId: null }, signal()),
    () => api.createCollection({ name: 'Collection', description: null }, signal()),
    () => api.addVideo({ name: 'Video', description: null, folderId: null, url: 'https://example.test/video' }, signal())]) {
    assert.deepEqual(await operation(), dto);
  }
  assert.deepEqual(calls.map(call => call.path), ['/api/library/summary', '/api/library/capabilities', '/api/library/items/id', '/api/library/folders', '/api/library/collections', '/api/library/videos']);
  assert.equal(JSON.parse(calls.at(-1).body).url, 'https://example.test/video');
  api.dispose();
});

test('session create/status/cancel/finalize/transfer contracts preserve operation identity', async () => {
  const sessionDto = { id: 'upload', state: 'receiving', reservedBytes: 400, cancellationRequested: true, resultPurged: false, errorCode: null };
  const { api, calls } = await fixture(call => call.path.endsWith('/content') ? new Response(null, { status: 204 }) : Response.json(sessionDto));
  const input = { clientUploadId: 'operation', category: 'document', fileName: 'code.ts', contentType: 'text/plain', sizeBytes: 200, checksum: 'a'.repeat(64), folderId: null };
  assert.deepEqual(await api.createUpload(input, signal()), sessionDto);
  assert.deepEqual(await api.upload('upload', signal()), sessionDto); assert.deepEqual(await api.cancelUpload('upload', signal()), sessionDto);
  await api.finalizeUpload('upload', { clientUploadId: input.clientUploadId, checksum: input.checksum }, signal());
  await api.uploadContent('upload', new Blob(['bytes']), signal());
  assert.deepEqual(calls.map(call => call.method), ['POST', 'GET', 'DELETE', 'POST', 'PUT']);
  assert.deepEqual(JSON.parse(calls[0].body), input); assert.deepEqual(JSON.parse(calls[3].body), { clientUploadId: 'operation', checksum: input.checksum });
  assert.equal(calls[4].body, 'bytes'); assert.equal(calls[4].headers.get('Content-Type'), 'application/octet-stream'); api.dispose();
});

test('private blobs use authenticated fixed item routes and reject non-PNG thumbnails', async () => {
  let type = 'image/png';
  const { api, calls } = await fixture(() => new Response('binary', { headers: { 'Content-Type': type } }));
  assert.equal(await (await api.thumbnail('id', signal())).text(), 'binary');
  assert.equal(await (await api.content('id', signal())).text(), 'binary');
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer access');
  assert.equal(calls[0].path, '/api/library/items/id/thumbnail'); assert.equal(calls[1].path, '/api/library/items/id/content');
  type = 'text/html'; await assert.rejects(api.thumbnail('id', signal()), error => error.status === 503); api.dispose();
});

for (const [status, code, message] of [[401, 'unauthenticated', /Sign in/], [404, 'library_not_found', /not be found/],
  [409, 'library_video_duplicate', /already in/], [409, 'library_folder_name_conflict', /folder with/],
  [409, 'library_quota_exceeded', /cleanup/], [503, 'library_storage_unavailable', /unavailable/]]) {
  test(`HTTP ${status} ${code} produces a recoverable UI message`, async () => {
    const { api } = await fixture(() => Response.json({ code }, { status }));
    await assert.rejects(api.summary(signal()), error => error instanceof LibraryApiError && error.status === status && message.test(libraryErrorMessage(error)));
    api.dispose();
  });
}

test('rate limits retain Retry-After and malformed server failures have safe messages', async () => {
  let status = 429;
  const { api } = await fixture(() => new Response(status === 429 ? '{"code":"library_rate_limited"}' : '<html>failure</html>', { status, headers: { 'Retry-After': '12' } }));
  await assert.rejects(api.summary(signal()), error => error.retryAfterSeconds === 12 && /12 seconds/.test(libraryErrorMessage(error)));
  status = 500; await assert.rejects(api.summary(signal()), error => error.code === 'library_unavailable' && !libraryErrorMessage(error).includes('html')); api.dispose();
});

test('storage-dependent addFile never claims success or creates placeholder/session metadata', async () => {
  const { api, calls } = await fixture(() => Response.json({}));
  await assert.rejects(api.addFile({ file: new File(['code'], 'code.ts'), category: 'document', folderId: null }, signal()), error => error.code === 'library_storage_unavailable');
  assert.deepEqual(calls.map(call => call.path), ['/api/library/capabilities']); api.dispose();
});

test('real addFile creates a checksum reservation, transfers, finalizes and loads the persisted detail', async () => {
  let input; const progress = [];
  const session = { id: 'upload', state: 'reserved', itemId: null, reservedBytes: 8, expiresAt: 'later' };
  const { api, calls } = await fixture(call => {
    if (call.path.endsWith('/capabilities')) return Response.json({ storageAvailable: true });
    if (call.path === '/api/library/uploads') { input = JSON.parse(call.body); return Response.json(session); }
    if (call.path.endsWith('/content')) { session.state = 'complete'; session.itemId = 'saved'; return Response.json(session); }
    if (call.path.endsWith('/finalize')) { assert.deepEqual(JSON.parse(call.body), { clientUploadId: input.clientUploadId, checksum: input.checksum }); return Response.json(session); }
    return Response.json({ id: 'saved', name: 'code.ts' });
  });
  const item = await api.addFile({ file: new File(['code'], 'code.ts'), category: 'document', folderId: null, onProgress: stage => progress.push(stage) }, signal());
  assert.equal(item.id, 'saved'); assert.equal(input.sizeBytes, 4); assert.match(input.checksum, /^[0-9a-f]{64}$/);
  assert.equal(input.contentType, 'text/plain'); assert.deepEqual(progress, ['checking', 'transferring', 'confirming']);
  assert.deepEqual(calls.map(call => call.method), ['GET', 'POST', 'PUT', 'POST', 'GET']); api.dispose();
});

test('retry after a lost transfer response reuses the operation and does not duplicate a completed file', async () => {
  const operationIds = []; let puts = 0;
  const session = { id: 'upload', state: 'reserved', itemId: null, reservedBytes: 8, expiresAt: 'later' };
  const { api } = await fixture(call => {
    if (call.path.endsWith('/capabilities')) return Response.json({ storageAvailable: true });
    if (call.path === '/api/library/uploads') { operationIds.push(JSON.parse(call.body).clientUploadId); return Response.json(session); }
    if (call.path.endsWith('/content')) { puts++; session.state = 'complete'; session.itemId = 'saved'; throw new Error('lost response'); }
    if (call.path.startsWith('/api/library/uploads/')) return Response.json(session);
    return Response.json({ id: 'saved' });
  });
  const input = { file: new File(['code'], 'code.ts'), category: 'document', folderId: null };
  await assert.rejects(api.addFile(input, signal()), /lost response/);
  assert.equal((await api.addFile(input, signal())).id, 'saved'); assert.equal(puts, 1);
  assert.equal(operationIds.length, 2); assert.equal(operationIds[0], operationIds[1]); api.dispose();
});

test('retry uses a new operation only after the server confirms terminal failure', async () => {
  const ids = []; let puts = 0; let state = 'reserved';
  const { api } = await fixture(call => {
    if (call.path.endsWith('/capabilities')) return Response.json({ storageAvailable: true });
    if (call.path === '/api/library/uploads') { ids.push(JSON.parse(call.body).clientUploadId); state = 'reserved'; return Response.json({ id: `upload-${ids.length}`, state }); }
    if (call.path.endsWith('/content')) { puts++; if (puts === 1) { state = 'failed'; return Response.json({ code: 'library_processing_unavailable' }, { status: 503 }); } state = 'complete'; }
    if (call.path.startsWith('/api/library/uploads/')) return Response.json({ id: `upload-${ids.length}`, state, itemId: state === 'complete' ? 'saved' : null });
    return Response.json({ id: 'saved' });
  });
  const input = { file: new File(['code'], 'code.ts'), category: 'document', folderId: null };
  await assert.rejects(api.addFile(input, signal()), error => error.status === 503);
  assert.equal((await api.addFile(input, signal())).id, 'saved'); assert.equal(puts, 2); assert.notEqual(ids[0], ids[1]); api.dispose();
});

test('cancelling an active upload requests durable cancellation with a fresh signal', async () => {
  const controller = new AbortController(); let cancelled = false;
  const { api } = await fixture(call => {
    if (call.path.endsWith('/capabilities')) return Response.json({ storageAvailable: true });
    if (call.path === '/api/library/uploads') return Response.json({ id: 'upload', state: 'reserved' });
    if (call.path.endsWith('/content')) { controller.abort(); throw controller.signal.reason; }
    if (call.method === 'DELETE') { cancelled = true; assert.equal(call.signal.aborted, false); return Response.json({ id: 'upload', state: 'cancelled' }); }
    throw new Error('unexpected request');
  });
  await assert.rejects(api.addFile({ file: new File(['code'], 'code.ts'), category: 'document', folderId: null }, controller.signal), error => error.name === 'AbortError');
  assert.equal(cancelled, true); api.dispose();
});

test('abort and account disposal stop pending requests', async () => {
  const { api, calls } = await fixture(call => new Promise((resolve, reject) => {
    call.signal.addEventListener('abort', () => reject(call.signal.reason), { once: true });
  }));
  const request = api.summary(signal()); await new Promise(resolve => setTimeout(resolve, 10)); api.dispose();
  await assert.rejects(request, error => error.name === 'AbortError'); assert.equal(calls[0].signal.aborted, true);
  await assert.rejects(api.summary(signal()), error => error.name === 'AbortError');
});

test('an old account request is not retried under a different refreshed identity', async () => {
  let protectedCalls = 0;
  const { api, calls } = await fixture(call => {
    if (call.path === '/api/auth/refresh') return Response.json(session('other', 'other-token'));
    protectedCalls++; return Response.json({}, { status: 401 });
  });
  await assert.rejects(api.createFolder({ name: 'Private', category: 'document', parentId: null }, signal()), error => error.code === 'account_changed');
  assert.equal(protectedCalls, 1); assert.equal(currentSession().user.id, 'other');
  assert.equal(calls.filter(call => call.path === '/api/library/folders').length, 1); api.dispose();
});

test('same-account token renewal is reused by private requests without exposing credentials in URLs', async () => {
  const { api, calls } = await fixture(call => {
    if (call.path === '/api/auth/refresh') return Response.json(session('owner', 'renewed'));
    return call.headers.get('Authorization') === 'Bearer renewed' ? Response.json({ categories: [] }) : Response.json({}, { status: 401 });
  });
  assert.deepEqual(await api.summary(signal()), { categories: [] });
  assert.equal(calls.filter(call => call.path === '/api/library/summary').length, 2);
  assert.equal(calls.at(-1).headers.get('Authorization'), 'Bearer renewed'); assert.equal(calls.at(-1).query.size, 0);
  api.dispose(); setSessionExpiredHandler(null);
});
