import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const output = await build({ entryPoints: ['src/features/library/pictureThumbnailCache.ts'], bundle: true,
  write: false, format: 'esm', platform: 'node' });
const { createPictureThumbnailCache, clearPictureThumbnailCache } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const signal = () => new AbortController().signal;
const png = () => new Blob(['preview'], { type: 'image/png' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('cold previews load one at a time when browser storage is unavailable', async () => {
  let active = 0, maximum = 0;
  const cache = createPictureThumbnailCache('owner', async () => {
    maximum = Math.max(maximum, ++active); await wait(5); active--; return png();
  }, () => {});
  const previews = await Promise.all(Array.from({ length: 8 }, (_, id) => cache.read(String(id), 'private-reference', signal())));
  assert.equal(maximum, 1); assert.equal(previews.length, 8); cache.dispose();
});

test('blocked browser storage falls back to authenticated loading', async () => {
  globalThis.indexedDB = { open() { throw new DOMException('Disabled', 'SecurityError'); } };
  let loads = 0;
  try {
    const cache = createPictureThumbnailCache('owner', async () => { loads++; return png(); }, () => {});
    assert.equal(await (await cache.read('one', 'reference', signal())).text(), 'preview');
    assert.equal(loads, 1); cache.dispose();
  } finally { delete globalThis.indexedDB; }
});

test('a failed preview does not block the following queued image', async () => {
  const cache = createPictureThumbnailCache('owner', async id => {
    if (id === 'bad') throw Error('storage unavailable'); return png();
  }, () => {});
  const results = await Promise.allSettled([cache.read('bad', 'reference', signal()), cache.read('good', 'reference', signal())]);
  assert.equal(results[0].status, 'rejected'); assert.equal(results[1].status, 'fulfilled'); cache.dispose();
});

test('queued requests stop before making API calls after disposal', async () => {
  let release; const calls = [];
  const cache = createPictureThumbnailCache('owner', id => {
    calls.push(id); return new Promise(resolve => { release = () => resolve(png()); });
  }, () => {});
  const reads = Promise.allSettled([cache.read('one', 'reference', signal()), cache.read('two', 'reference', signal())]);
  await wait(5); cache.dispose(); release();
  assert.ok((await reads).every(result => result.status === 'rejected' && result.reason.name === 'AbortError'));
  assert.deepEqual(calls, ['one']);
});

test('deleting an item fences a late download without discarding other queued pictures', async () => {
  let release;
  const cache = createPictureThumbnailCache('owner', async id => id === 'one'
    ? new Promise(resolve => { release = () => resolve(png()); }) : png(), () => {});
  const reads = Promise.allSettled([cache.read('one', 'reference', signal()), cache.read('two', 'reference', signal())]);
  await wait(5); await cache.forget(['one']); release();
  const results = await reads;
  assert.equal(results[0].status, 'rejected'); assert.equal(results[0].reason.name, 'AbortError');
  assert.equal(results[1].status, 'fulfilled'); cache.dispose();
});

test('sign-out fences late previews and account mismatch rejects reads before loading', async () => {
  let release;
  const cache = createPictureThumbnailCache('owner', () => new Promise(resolve => { release = () => resolve(png()); }), () => {});
  const read = cache.read('one', 'reference', signal());
  const rejected = assert.rejects(read, error => error.name === 'AbortError');
  await wait(5); await clearPictureThumbnailCache(); release(); await rejected; cache.dispose();
  let loads = 0;
  const other = createPictureThumbnailCache('other', async () => { loads++; return png(); }, () => { throw Error('account changed'); });
  await assert.rejects(other.read('one', 'reference', signal()), /account changed/); assert.equal(loads, 0); other.dispose();
});
