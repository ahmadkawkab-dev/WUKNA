import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Opt-in real API verification. Use an isolated migrated PostgreSQL database and
// disposable Opera profile; never point this account-creating flow at production.
const origin = process.env.WUKNA_LIBRARY_HTTP_ORIGIN || 'http://localhost:5178';
const target = new URL(origin);
if (!['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('This test requires a disposable localhost environment.');
const modulePath = process.env.WUKNA_PLAYWRIGHT_MODULE || 'playwright';
const { chromium, request } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const browser = await chromium.connectOverCDP(process.env.WUKNA_OPERA_CDP || 'http://127.0.0.1:9226');
const protocol = await browser.newBrowserCDPSession(); const version = await protocol.send('Browser.getVersion'); await protocol.detach();
if (!version.userAgent.includes('OPR/')) throw new Error('Use the disposable Opera test profile.');
const output = process.env.WUKNA_AUDIT_OUTPUT || '/tmp/wukna-library-phase4-browser'; await fs.mkdir(output, { recursive: true });
let libraryRequests = 0;
const password = 'LibraryPhase4-Test!2026'; const runId = Date.now(); const errors = [], checkpoints = [];
let context, page; const apiContexts = [];
async function account(label) {
  const api = await request.newContext({ baseURL: origin }); apiContexts.push(api);
  const email = `library-${label}-${runId}@example.test`;
  const csrf = await (await api.get('/api/auth/csrf')).json();
  const registered = await api.post('/api/auth/register', { headers: { 'X-CSRF-TOKEN': csrf.token }, data: { email, password } });
  assert.equal(registered.status(), 200, `register ${label}`); const session = await registered.json();
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const saved = await api.put('/api/profile/onboarding', { headers, data: { status: 'Skipped', version: 1 } }); assert.equal(saved.status(), 200);
  return { api, email, headers, id: session.user.id };
}
async function settle() { await page.waitForFunction(() => !document.querySelector('.wk-library [aria-busy="true"]')); }
async function go(route) { await page.goto(`${origin}${route}`); await page.locator('.wk-library').waitFor(); await settle(); }
async function save() { const dialog = page.locator('.wk-lib-action-dialog'); await dialog.getByRole('button', { name: 'Save', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); await settle(); }
async function action(name, label) { await page.locator(`summary[aria-label="Actions for ${name}"]`).click(); await page.locator('.wk-lib-item-menu[open]').getByRole('button', { name: label, exact: true }).click(); }
async function record(label) {
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    anonymous: [...document.querySelectorAll('button,input,select,textarea')].filter(element => {
      if (!element.getClientRects().length || element.closest('[hidden]')) return false;
      return !(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.textContent.trim() || element.labels?.length || element.getAttribute('title'));
    }).length }));
  assert.ok(layout.scrollWidth <= layout.width, `${label}: horizontal overflow`); assert.equal(layout.anonymous, 0, `${label}: accessible controls`);
  await page.screenshot({ path: `${output}/${label}.png`, fullPage: true }); checkpoints.push(label); console.log(`Passed: ${label}`);
}
try {
  const owner = await account('owner'), other = await account('other');
  context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/library/')) libraryRequests++; });
  await page.goto(`${origin}/login`); await page.getByLabel(/^Email address/).fill(owner.email); await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL('**/home');
  const capabilities = await (await owner.api.get('/api/library/capabilities', { headers: owner.headers })).json();
  const storage = await (await owner.api.get('/api/library/storage', { headers: owner.headers })).json(); assert.equal(storage.quotaBytes, 1_000_000_000);
  await go('/library'); assert.equal(await page.locator('.wk-library-preview-bar').count(), 0);
  if (!capabilities.storageAvailable) assert.ok(await page.getByRole('button', { name: 'Uploads unavailable', exact: true }).isDisabled());
  await record('desktop-dashboard');
  await go('/library/videos'); await page.getByRole('button', { name: 'New folder', exact: true }).click(); await page.getByLabel(/^Name/).fill('References'); await save();
  await page.getByRole('button', { name: 'New folder', exact: true }).click(); await page.getByLabel(/^Name/).fill('Disposable folder'); await save();
  await page.locator('.wk-lib-folder-grid button').filter({ hasText: 'Disposable folder' }).click();
  await page.getByRole('button', { name: 'Delete empty folder', exact: true }).click();
  await page.locator('.wk-lib-action-dialog').getByRole('button', { name: 'Delete', exact: true }).click(); await page.locator('.wk-lib-action-dialog').waitFor({ state: 'hidden' });
  await page.locator('.wk-lib-folder-grid button').filter({ hasText: 'References' }).waitFor();
  await page.locator('.wk-lib-folder-grid button').filter({ hasText: 'References' }).click();
  await page.getByRole('button', { name: 'New folder', exact: true }).click(); await page.getByLabel(/^Name/).fill('Nested'); await save();
  await page.locator('.wk-lib-folder-grid button').filter({ hasText: 'Nested' }).click();
  await page.getByRole('button', { name: 'Save video link', exact: true }).click();
  await page.getByLabel(/^Title/).fill('Saved reference'); await page.getByLabel(/^Video URL/).fill('https://example.test/videos/phase4'); await save();
  await go('/library/videos'); await page.reload(); await page.getByRole('button', { name: 'Saved reference', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add Saved reference to favorites', exact: true }).click(); await page.getByRole('button', { name: 'Remove Saved reference from favorites', exact: true }).waitFor();
  await action('Saved reference', 'Rename'); await page.getByLabel(/^Name/).fill('Renamed reference'); await save();
  await action('Renamed reference', 'Tags & notes'); await page.getByLabel('Tags', { exact: true }).fill('research, private'); await page.getByLabel('Personal note', { exact: true }).fill('Persisted across refresh.'); await save();
  await page.getByRole('button', { name: 'Renamed reference', exact: true }).click();
  await page.getByText('Persisted across refresh.', { exact: true }).waitFor(); assert.match(await page.locator('.wk-lib-details').innerText(), /References \/ Nested/);
  await record('desktop-video-detail'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save video link', exact: true }).click(); await page.getByLabel(/^Title/).fill('Duplicate');
  await page.getByLabel(/^Video URL/).fill('https://example.test/videos/phase4'); await page.locator('.wk-lib-action-dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.wk-lib-action-dialog [role="alert"]').waitFor(); assert.match(await page.locator('.wk-lib-action-dialog [role="alert"]').innerText(), /already in/);
  await record('desktop-conflict'); await page.keyboard.press('Escape');
  await go('/library/collections'); await page.getByRole('button', { name: 'New collection', exact: true }).click(); await page.getByLabel(/^Name/).fill('Research'); await save();
  await page.locator('.wk-lib-collection-grid button').filter({ hasText: 'Research' }).click(); await page.getByRole('button', { name: 'Add items', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Renamed reference', exact: true }).check(); await save();
  await page.getByRole('button', { name: /^Renamed reference/ }).waitFor(); await page.reload(); await page.getByRole('button', { name: 'Edit collection', exact: true }).waitFor();
  await page.getByRole('button', { name: '← All collections', exact: true }).click(); await page.locator('.wk-lib-collection-grid button').filter({ hasText: 'Research' }).waitFor();
  assert.match(await page.locator('.wk-lib-collection-grid').innerText(), /1 items/);
  await page.locator('.wk-lib-collection-grid button').filter({ hasText: 'Research' }).click();
  await page.getByRole('button', { name: 'Edit collection', exact: true }).click(); await page.getByLabel(/^Name/).fill('Research edited'); await save();
  await page.locator('.wk-lib-membership summary').click();
  await page.getByLabel('Item', { exact: true }).selectOption({ label: 'Renamed reference' }); await page.getByRole('button', { name: 'Remove from collection', exact: true }).click();
  await settle(); await page.getByRole('button', { name: 'Add items', exact: true }).click(); await page.getByRole('checkbox', { name: 'Renamed reference', exact: true }).check(); await save();
  await page.getByRole('button', { name: 'Delete collection', exact: true }).click(); await page.locator('.wk-lib-action-dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.locator('.wk-lib-action-dialog').waitFor({ state: 'hidden' });
  await go('/library/favorites'); await page.getByRole('button', { name: /^Renamed reference/ }).waitFor();
  await go('/library'); await page.getByLabel('Search your library', { exact: true }).fill('Renamed reference'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await page.getByRole('button', { name: /^Renamed reference/ }).waitFor();
  const list = await (await owner.api.get('/api/library/items?category=video', { headers: owner.headers })).json(); const id = list.items[0].id;
  const foreign = await other.api.get(`/api/library/items/${id}`, { headers: other.headers }); assert.equal(foreign.status(), 404);
  const foreignWrite = await other.api.patch(`/api/library/items/${id}`, { headers: other.headers, data: { name: 'Forbidden' } }); assert.equal(foreignWrite.status(), 404);
  await go('/library/videos'); await action('Renamed reference', 'Move to Trash'); await save();
  await go('/library/trash'); await page.getByRole('button', { name: /^Renamed reference/ }).waitFor(); await action('Renamed reference', 'Restore'); await save();
  await go('/library/videos'); await page.getByRole('button', { name: /^Renamed reference/ }).waitFor();
  await action('Renamed reference', 'Organize'); await page.getByLabel('Folder', { exact: true }).selectOption(''); await save();
  await page.reload(); await page.getByRole('button', { name: 'Renamed reference', exact: true }).click();
  assert.match(await page.locator('.wk-lib-details').innerText(), /Folder\s+Root/); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 }); await record('mobile-videos');
  await page.getByRole('button', { name: /^More/ }).click();
  const moreLabels = await page.locator('.wk-mobile-more-links button').allTextContents(); assert.equal(moreLabels[1].trim(), 'Library'); assert.ok(moreLabels.at(-1).trim().startsWith('Notifications'));
  assert.equal(await page.getByRole('dialog').locator('.wk-sidebar-storage').isVisible(), true); await record('mobile-more'); await page.keyboard.press('Escape');
  await go('/library/documents'); if (!capabilities.storageAvailable) assert.ok(await page.getByRole('button', { name: 'Uploads unavailable', exact: true }).isDisabled()); await record('mobile-documents');
  await go('/library/storage'); assert.ok(await page.getByRole('button', { name: 'Paid plans coming later', exact: true }).isDisabled()); await record('mobile-storage');
  await page.setViewportSize({ width: 1440, height: 1040 }); await go('/library/videos');
  await action('Renamed reference', 'Move to Trash'); await save(); await go('/library/trash'); await action('Renamed reference', 'Delete permanently');
  await page.locator('.wk-lib-action-dialog').getByRole('button', { name: 'Delete', exact: true }).click(); await page.locator('.wk-lib-action-dialog').waitFor({ state: 'hidden' });
  assert.equal((await owner.api.get(`/api/library/items/${id}`, { headers: owner.headers })).status(), 404);
  await page.goto(`${origin}/home`); await page.locator('.wk-sidebar-storage progress').waitFor();
  assert.ok(await page.locator('.wk-sidebar-storage progress').isVisible());
  await go('/library/videos'); assert.equal(await page.getByRole('button', { name: 'Renamed reference', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ checkpoints, errors, libraryRequests, persistence: true, ownershipIsolation: true, storageAvailable: capabilities.storageAvailable, accountQuotaBytes: storage.quotaBytes }, null, 2));
  console.log('Real Library HTTP flow passed: login, folders, nested navigation, video create/edit/reload, favorites, notes, duplicate conflict, collections, search, Trash/restore/purge, ownership and desktop/mobile storage navigation.');
} catch (error) {
  if (page) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); await fs.writeFile(`${output}/failure.txt`, (await page.locator('body').innerText()).slice(0, 16000)).catch(() => {}); }
  throw error;
} finally {
  await context?.close(); await Promise.all(apiContexts.map(api => api.dispose())); await browser.close();
}
