import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';
const built = await build({ stdin: { contents: `export * from './src/features/library/capture';`, resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { libraryDropAction, videoCapture } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const transfer = (files = [], text = '') => ({ files, getData: type => type === 'text/plain' ? text : '' });
test('dropped files retain category and folder and start the existing upload flow', () => {
  for (const [category, name] of [['picture', 'photo.JPG'], ['document', 'source.ts']]) {
    const file = new File(['content'], name);
    assert.deepEqual(libraryDropAction(category, transfer([file]), 'owned-folder'), { type: 'upload', category, folderId: 'owned-folder', files: [file], autoStart: true });
  }
  assert.throws(() => libraryDropAction('picture', transfer([new File(['text'], 'document.txt')])), /documents into Documents/);
  assert.throws(() => libraryDropAction('document', transfer(Array.from({ length: 11 }, () => new File(['text'], 'document.txt')))), /10 files/);
  assert.throws(() => libraryDropAction('video', transfer([new File(['bytes'], 'movie.mp4')])), /video link instead/);
});
test('video capture normalizes YouTube shares, including Android text-only payloads, and validates HTTPS', () => {
  assert.deepEqual(videoCapture({ text: 'Watch this: https://youtu.be/aqz-KE-bpKQ?si=tracking', title: 'My saved video' }), { name: 'My saved video', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
  assert.equal(videoCapture({ url: '', text: 'https://youtu.be/dQw4w9WgXcQ?si=tracking', title: 'Android share' }).url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(libraryDropAction('video', transfer([], 'https://www.youtube.com/shorts/aqz-KE-bpKQ'), 'videos-folder').folderId, 'videos-folder');
  for (const url of ['javascript:alert(1)', 'http://youtube.com/watch?v=aqz-KE-bpKQ', 'https://user:password@example.test/video', 'https://youtube.com/watch?v=invalid']) assert.throws(() => videoCapture({ url }), /valid HTTPS/);
});
const workerSource = await readFile(new URL('../public/library-share-worker.js', import.meta.url), 'utf8');
function shareWorker() {
  const handlers = {}, shares = new Map();
  const db = { close() {}, transaction() {
    const tx = { objectStore: () => ({ put(value) { shares.set(value.id, value); }, openCursor() { const request = {}; queueMicrotask(() => { request.result = null; request.onsuccess?.(); }); return request; } }) };
    setImmediate(() => tx.oncomplete?.()); return tx;
  } };
  const indexedDB = { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess?.(); }); return request; } };
  vm.runInNewContext(workerSource, { self: { location: { origin: 'https://wukna.test' }, addEventListener: (name, listener) => { handlers[name] = listener; } }, indexedDB, crypto: webcrypto, URL, Date, Number, Response });
  return { shares, async post({ origin = null, site = 'none', mode = 'navigate', title = 'Shared video', text = 'https://youtu.be/aqz-KE-bpKQ' } = {}) {
    const form = new FormData(); form.set('title', title); form.set('text', text);
    let result;
    handlers.fetch({ request: { url: 'https://wukna.test/library/share', method: 'POST', mode, headers: new Headers({ ...(origin ? { Origin: origin } : {}), 'Sec-Fetch-Site': site }), formData: async () => form }, respondWith: value => { result = value; } });
    return result;
  } };
}
test('the installed share target receives POST data and returns an opaque local handoff without saving unauthenticated', async () => {
  const worker = shareWorker(), response = await worker.post();
  assert.equal(response.status, 303);
  const destination = new URL(response.headers.get('Location')); assert.equal(destination.pathname, '/library/videos');
  const record = worker.shares.get(destination.searchParams.get('share'));
  assert.equal(record.text, 'https://youtu.be/aqz-KE-bpKQ'); assert.equal(record.title, 'Shared video');
  assert.equal(destination.searchParams.has('url'), false, 'shared content is not copied into history/redirect URLs');
  assert.equal('accessToken' in record, false);
});
test('cross-site and non-navigation POSTs cannot create automatic share handoffs', async () => {
  const worker = shareWorker();
  for (const request of [{ origin: 'https://evil.test' }, { origin: 'null', site: 'cross-site' }, { mode: 'cors' }]) assert.equal((await worker.post(request)).status, 403);
  assert.equal(worker.shares.size, 0);
});
