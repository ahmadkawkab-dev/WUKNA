import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

// Opt-in localhost verification with disposable accounts and scanned test images.
const origin = process.env.WUKNA_LIBRARY_HTTP_ORIGIN || 'http://127.0.0.1:5181';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use a local test environment.');
const modulePath = process.env.WUKNA_PLAYWRIGHT_MODULE || 'playwright';
const { chromium, request } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const browser = await chromium.launch({ headless: true, executablePath: process.env.WUKNA_CHROMIUM_PATH, args: ['--no-sandbox'] });
const output = process.env.WUKNA_AUDIT_OUTPUT || '/tmp/wukna-picture-cache';
await fs.mkdir(output, { recursive: true });
const api = await request.newContext({ baseURL: origin });
const password = `Cache-test!${randomUUID()}`, email = `storage-check-owner-${Date.now()}@example.test`;
let context, page, headers; const ids = [], errors = []; const report = {};
async function cacheRows() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('wukna-library-picture-previews', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('thumbnails');
      const rows = tx.objectStore('thumbnails').getAll();
      rows.onsuccess = () => resolve(rows.result.map(row => ({ id: row.id, accountId: row.accountId, bytes: row.blob.size })));
      tx.oncomplete = () => db.close();
    }; request.onerror = () => reject(request.error);
  }));
}
try {
  const csrf = await (await api.get('/api/auth/csrf')).json();
  const registration = await api.post('/api/auth/register', { headers: { 'X-CSRF-TOKEN': csrf.token }, data: { email, password } });
  assert.equal(registration.status(), 200); const session = await registration.json(); headers = { Authorization: `Bearer ${session.accessToken}` };
  await fs.writeFile(`${output}/test-accounts.json`, JSON.stringify([{ id: session.user.id, email }]), { mode: 0o600 });
  await api.put('/api/profile/onboarding', { headers, data: { status: 'Skipped', version: 1 } });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/login`);
  await page.getByLabel(/^Email address/).fill(email); await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL('**/home');
  const images = await page.evaluate(() => ['image/png', 'image/jpeg'].map(type => {
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80;
    const painter = canvas.getContext('2d'); painter.fillStyle = '#427e79'; painter.fillRect(0, 0, 120, 80);
    painter.fillStyle = '#acccbd'; painter.fillRect(20, 20, 80, 40);
    return { type, base64: canvas.toDataURL(type).split(',')[1] };
  }));
  for (let index = 0; index < 5; index++) {
    const image = images[index % 2], data = Buffer.from(image.base64, 'base64');
    const clientUploadId = randomUUID(), checksum = createHash('sha256').update(data).digest('hex');
    const created = await api.post('/api/library/uploads', { headers, data: { clientUploadId, category: 'picture',
      fileName: `Cached picture ${index}.${image.type.endsWith('png') ? 'png' : 'jpg'}`, contentType: image.type, sizeBytes: data.length, checksum, folderId: null } });
    assert.equal(created.status(), 201); const upload = await created.json();
    assert.equal((await api.put(`/api/library/uploads/${upload.id}/content`, { headers: { ...headers, 'Content-Type': 'application/octet-stream' }, data })).status(), 200);
    const finalized = await api.post(`/api/library/uploads/${upload.id}/finalize`, { headers, data: { clientUploadId, checksum } });
    assert.equal(finalized.status(), 200); ids.push((await finalized.json()).itemId);
  }
  let requests = 0, active = 0, maximum = 0;
  page.on('request', request => { if (request.url().endsWith('/thumbnail')) { requests++; maximum = Math.max(maximum, ++active); } });
  page.on('requestfinished', request => { if (request.url().endsWith('/thumbnail')) active--; });
  page.on('requestfailed', request => { if (request.url().endsWith('/thumbnail')) active--; });
  await page.goto(`${origin}/library/pictures`);
  await page.waitForFunction(() => document.querySelectorAll('.wk-lib-card img').length === 5 && [...document.querySelectorAll('.wk-lib-card img')].every(image => image.complete && image.naturalWidth > 0));
  assert.equal(requests, 5); assert.equal(maximum, 1); assert.equal((await cacheRows()).length, 5);
  report.realScannedJpgAndPng = true; report.maximumColdPreviewRequests = maximum;
  const coldReads = requests;
  await page.route('**/api/library/items/*/thumbnail', route => route.fulfill({ status: 503, json: { code: 'library_storage_unavailable' } }));
  await page.route('**/api/library/items/*/content', route => route.fulfill({ status: 503, json: { code: 'library_storage_unavailable' } }));
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.wk-lib-card img').length === 5 && [...document.querySelectorAll('.wk-lib-card img')].every(image => image.complete && image.naturalWidth > 0));
  assert.equal(requests, coldReads); report.reloadThumbnailApiCalls = requests - coldReads;
  await page.getByRole('button', { name: 'Add Cached picture 0.png to favorites', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Cached picture 0.png from favorites', exact: true }).waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelectorAll('.wk-lib-card img').length === 5);
  assert.equal(requests, coldReads); report.favoriteAndFocusReuse = true;
  await page.screenshot({ path: `${output}/cached-pictures-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Cached picture 0.png', exact: true }).click();
  await page.locator('.wk-lib-viewer [role="alert"]').waitFor();
  await page.waitForFunction(() => document.querySelector('.wk-lib-picture-stage img')?.naturalWidth > 0);
  report.originalFailureShowsCachedPreview = true;
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 375, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${output}/cached-pictures-mobile.png`, fullPage: true });
  await page.locator('summary[aria-label="Actions for Cached picture 0.png"]').click();
  await page.locator('.wk-lib-item-menu[open]').getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await page.locator('.wk-lib-action-dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.wk-lib-action-dialog').waitFor({ state: 'hidden' });
  assert.equal((await cacheRows()).some(row => row.id === ids[0]), false); report.trashEvictsPreview = true;
  await page.goto(`${origin}/account/preferences`); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL('**/login'); assert.equal((await cacheRows()).length, 0); report.signOutClearsDisk = true;

  // Exercise real IndexedDB transactions without injecting fake browser storage.
  report.cachePolicies = await page.evaluate(async () => {
    const { createPictureThumbnailCache, clearPictureThumbnailCache, pictureCacheLimits } = await import('/src/features/library/pictureThumbnailCache.ts');
    const check = (condition, label) => { if (!condition) throw Error(label); };
    const signal = () => new AbortController().signal;
    let loads = 0;
    const create = (account, bytes = 20) => createPictureThumbnailCache(account, async () => { loads++; return new Blob([new Uint8Array(bytes)], { type: 'image/png' }); }, () => {});
    let cache = create('cache-test-a'); await cache.read('one', 'v1', signal()); cache.dispose();
    cache = create('cache-test-a'); await cache.read('one', 'v1', signal()); check(loads === 1, 'persistent reuse');
    await cache.read('one', 'v2', signal()); check(loads === 2, 'reference change');
    await cache.forget(['one']); await cache.read('one', 'v2', signal()); check(loads === 3, 'deletion eviction'); cache.dispose();
    cache = create('cache-test-b'); await cache.read('one', 'v2', signal()); check(loads === 4, 'account separation');
    for (let index = 0; index < 132; index++) await cache.read(String(index), 'v1', signal()); cache.dispose();
    const rows = () => new Promise(resolve => {
      const open = indexedDB.open('wukna-library-picture-previews', 1);
      open.onsuccess = () => { const db = open.result, tx = db.transaction('thumbnails');
        const request = tx.objectStore('thumbnails').getAll(); request.onsuccess = () => resolve(request.result); tx.oncomplete = () => db.close(); };
    });
    let saved = await rows(); check(saved.length <= pictureCacheLimits.entries, 'entry limit');
    check(saved.every(row => row.accountId === 'cache-test-b'), 'account cleanup');
    check(!saved.some(row => row.id === '0') && saved.some(row => row.id === '131'), 'oldest eviction');
    cache = create('cache-test-b'); await cache.read('4', 'v1', signal()); await cache.read('132', 'v1', signal()); cache.dispose();
    saved = await rows(); check(saved.some(row => row.id === '4') && !saved.some(row => row.id === '5'), 'reuse protects older entry');
    cache = create('cache-test-b', 900_000);
    for (let index = 0; index < 40; index++) await cache.read(`large-${index}`, 'v1', signal()); cache.dispose();
    saved = await rows(); check(saved.reduce((sum, row) => sum + row.blob.size, 0) <= pictureCacheLimits.bytes, 'byte limit');
    // Expire a real stored preview and verify that it is fetched again.
    await new Promise(resolve => {
      const open = indexedDB.open('wukna-library-picture-previews', 1); open.onsuccess = () => {
        const db = open.result, tx = db.transaction('thumbnails', 'readwrite');
        const row = saved.find(row => row.id === 'large-39'); tx.objectStore('thumbnails').put({ ...row, savedAt: Date.now() - pictureCacheLimits.age - 1 });
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
    const before = loads; cache = create('cache-test-b'); await cache.read('large-39', 'v1', signal());
    check(loads === before + 1, 'expiry refresh'); cache.dispose();
    await clearPictureThumbnailCache(); check((await rows()).length === 0, 'clear database');
    return { persistentReuse: true, referenceChange: true, deletion: true, accountIsolation: true, entryLimit: true, byteLimit: true, leastRecentlyUsedEviction: true, expiry: true };
  });
  assert.deepEqual(errors, []); report.browserErrors = errors;
  await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log('Real scanned picture previews, warm reload with no thumbnail calls, original-failure fallback, mobile layout, deletion, sign-out and IndexedDB limits passed.');
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); throw error;
} finally {
  if (headers) {
    const active = (await (await api.get('/api/library/items', { headers })).json()).items.map(item => item.id);
    if (active.length) await api.post('/api/library/items/trash', { headers, data: { ids: active } });
    const trashed = (await (await api.get('/api/library/items?trash=true', { headers })).json()).items.map(item => item.id);
    if (trashed.length) assert.equal((await api.post('/api/library/items/purge', { headers, data: { ids: trashed } })).status(), 204);
    for (let attempt = 0; attempt < 40; attempt++) {
      const usage = await (await api.get('/api/library/storage', { headers })).json();
      if (usage.usedBytes === 0 && usage.reservedBytes === 0) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  await context?.close(); await api.dispose(); await browser.close();
}
