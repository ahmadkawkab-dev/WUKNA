import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Opt-in: real disposable localhost API, PostgreSQL, SeaweedFS and ClamAV.
const origin = process.env.WUKNA_LIBRARY_HTTP_ORIGIN || 'http://localhost:5179';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Use a disposable localhost environment.');
const modulePath = process.env.WUKNA_PLAYWRIGHT_MODULE || 'playwright';
const { chromium, request } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const browser = await chromium.connectOverCDP(process.env.WUKNA_OPERA_CDP || 'http://127.0.0.1:9227');
const protocol = await browser.newBrowserCDPSession(); const version = await protocol.send('Browser.getVersion'); await protocol.detach();
if (!version.userAgent.includes('OPR/')) throw new Error('Use a disposable Opera test profile.');
const output = process.env.WUKNA_AUDIT_OUTPUT || '/tmp/wukna-library-phase5-browser'; await fs.mkdir(output, { recursive: true });
const password = 'LibraryPhase5-Test!2026'; const runId = Date.now(); const contexts = []; const errors = [], checkpoints = [];
let context, page;
const source = Buffer.from("const privateMessage = '<script>window.__libraryUnsafe = true</script>';\n", 'utf8');
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function office(extension) {
  const main = extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  const type = extension === 'docx' ? 'wordprocessingml.document' : 'spreadsheetml.sheet';
  const entries = [
    ['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.${type}.main+xml" /></Types>`],
    ['_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${main}" /></Relationships>`],
    [main, extension === 'docx' ? '<document xmlns="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><body /></document>' : '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets /></workbook>'],
  ];
  const files = [], directory = []; let offset = 0;
  for (const [name, text] of entries) {
    const filename = Buffer.from(name), bytes = Buffer.from(text); const local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc32(bytes), 14);
    local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc32(bytes), 16);
    central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    files.push(local, filename, bytes); directory.push(central, filename); offset += local.length + filename.length + bytes.length;
  }
  const index = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, index, end]);
}
function pdf() {
  let text = '%PDF-1.7\n'; const offsets = [];
  for (const definition of ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>']) {
    offsets.push(text.length); text += `${offsets.length} 0 obj\n${definition}\nendobj\n`;
  }
  const xref = text.length; text += 'xref\n0 4\n0000000000 65535 f \n';
  for (const offset of offsets) text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(`${text}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
function png() {
  const width = 192, height = 128; const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const at = y * (width * 4 + 1) + 1 + x * 4; pixels.set([x, y, 120, 255], at); }
  function chunk(type, bytes) {
    const name = Buffer.from(type), data = Buffer.concat([name, bytes]);
    const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(data));
    return Buffer.concat([length, data, checksum]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
async function account(label) {
  const api = await request.newContext({ baseURL: origin }); contexts.push(api); const email = `library-storage-${label}-${runId}@example.test`;
  const csrf = await (await api.get('/api/auth/csrf')).json();
  const response = await api.post('/api/auth/register', { headers: { 'X-CSRF-TOKEN': csrf.token }, data: { email, password } }); assert.equal(response.status(), 200);
  const session = await response.json(); const headers = { Authorization: `Bearer ${session.accessToken}` };
  assert.equal((await api.put('/api/profile/onboarding', { headers, data: { status: 'Skipped', version: 1 } })).status(), 200);
  return { api, email, headers };
}
async function go(route) { await page.goto(`${origin}${route}`); await page.locator('.wk-library').waitFor(); }
async function upload(name, mimeType, buffer, succeeds = true) {
  await page.getByRole('button', { name: 'Upload', exact: true }).click(); const dialog = page.locator('.wk-lib-action-dialog');
  await dialog.getByLabel('Choose Library files', { exact: true }).setInputFiles({ name, mimeType, buffer });
  await dialog.getByRole('button', { name: 'Upload files', exact: true }).click();
  if (succeeds) await dialog.locator('.wk-lib-upload-queue').getByText('Added', { exact: true }).waitFor();
  else await dialog.locator('.wk-lib-upload-queue').getByText(/did not pass the security check/).waitFor();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
}
async function record(label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${output}/${label}.png`, fullPage: true }); checkpoints.push(label); console.log(`Passed: ${label}`);
}
async function action(name, action) {
  await page.locator(`summary[aria-label="Actions for ${name}"]`).click(); await page.locator('.wk-lib-item-menu[open]').getByRole('button', { name: action, exact: true }).click();
  await page.locator('.wk-lib-action-dialog').getByRole('button', { name: action === 'Delete permanently' ? 'Delete' : 'Save', exact: true }).click();
  await page.locator('.wk-lib-action-dialog').waitFor({ state: 'hidden' });
}
try {
  const owner = await account('owner'), other = await account('other');
  assert.deepEqual((await (await owner.api.get('/api/library/items', { headers: owner.headers })).json()).items, []);
  assert.equal((await (await owner.api.get('/api/library/storage', { headers: owner.headers })).json()).quotaBytes, 1_000_000_000);
  context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, serviceWorkers: 'block', reducedMotion: 'reduce', acceptDownloads: true });
  page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/login`); await page.getByLabel(/^Email address/).fill(owner.email); await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL('**/home');
  await go('/library/documents'); assert.equal(await page.locator('.wk-library-preview-bar').count(), 0);
  await upload('private.ts', 'text/plain', source);
  if (process.env.WUKNA_LIBRARY_RESTART_API) await promisify(execFile)(process.env.WUKNA_LIBRARY_RESTART_API, [], { timeout: 90000 });
  await page.reload(); await page.locator('.wk-lib-table-name').filter({ hasText: 'private.ts' }).click();
  await page.locator('.wk-code-document pre').waitFor(); assert.match(await page.locator('.wk-code-document pre').innerText(), /window\.__libraryUnsafe/);
  assert.equal(await page.evaluate(() => window.__libraryUnsafe), undefined);
  const downloading = page.waitForEvent('download'); await page.locator('.wk-lib-viewer-dialog').getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloading; assert.equal(download.suggestedFilename(), 'private.ts'); assert.deepEqual(await fs.readFile(await download.path()), source);
  await record('desktop-private-code'); await page.keyboard.press('Escape');
  const docs = await (await owner.api.get('/api/library/items?category=document', { headers: owner.headers })).json(); const documentId = docs.items[0].id;
  assert.equal((await other.api.get(`/api/library/items/${documentId}/content`, { headers: other.headers })).status(), 404);
  await upload('security-test.txt', 'text/plain', Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'), false);
  assert.equal((await (await owner.api.get('/api/library/items?category=document', { headers: owner.headers })).json()).items.length, 1);
  const extraDocuments = [];
  for (const [name, mimeType, bytes, kind] of [
    ['private.pdf', 'application/pdf', pdf(), 'pdf'],
    ['private.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', office('docx'), 'unavailable'],
    ['private.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', office('xlsx'), 'unavailable'],
    ['private.md', 'text/markdown', Buffer.from('Private UTF-8 text: café.\n'), 'text'],
  ]) {
    await upload(name, mimeType, bytes); await page.reload();
    await page.locator('.wk-lib-table-name').filter({ hasText: name }).click();
    const documents = await (await owner.api.get('/api/library/items?category=document', { headers: owner.headers })).json();
    const id = documents.items.find(item => item.name === name).id; extraDocuments.push(id);
    const detail = await (await owner.api.get(`/api/library/items/${id}`, { headers: owner.headers })).json(); assert.equal(detail.previewKind, kind);
    if (kind === 'pdf') { await page.locator('object.wk-lib-pdf').waitFor(); assert.match(await page.locator('object.wk-lib-pdf').getAttribute('data'), /^blob:/); await record('desktop-private-pdf'); }
    if (kind === 'unavailable') await page.getByText('This format can be downloaded and opened in its own application.', { exact: true }).waitFor();
    if (name === 'private.docx') await record('desktop-private-office');
    if (kind === 'text') assert.equal(await page.locator('.wk-lib-text-document').textContent(), bytes.toString());
    const pending = page.waitForEvent('download'); await page.locator('.wk-lib-viewer-dialog').getByRole('button', { name: 'Download', exact: true }).click();
    const original = await pending; assert.equal(original.suggestedFilename(), name); assert.deepEqual(await fs.readFile(await original.path()), bytes);
    assert.equal((await other.api.get(`/api/library/items/${id}/content`, { headers: other.headers })).status(), 404);
    assert.equal((await contexts[1].get(`/api/library/items/${id}/content`)).status(), 401);
    await page.keyboard.press('Escape');
  }
  await go('/library/pictures'); const image = png(); await upload('private.png', 'image/png', image); await page.reload();
  await page.locator('.wk-lib-card img').waitFor(); assert.equal(await page.locator('.wk-lib-card img').evaluate(img => img.src.startsWith('blob:')), true);
  await page.getByRole('button', { name: 'private.png', exact: true }).click(); await page.locator('.wk-lib-picture-stage img').waitFor();
  await page.waitForFunction(() => document.querySelector('.wk-lib-picture-stage img')?.naturalWidth === 192);
  await record('desktop-private-picture'); await page.keyboard.press('Escape');
  const pictures = await (await owner.api.get('/api/library/items?category=picture', { headers: owner.headers })).json(); const pictureId = pictures.items[0].id;
  assert.equal((await other.api.get(`/api/library/items/${pictureId}/thumbnail`, { headers: other.headers })).status(), 404);
  const downloadedPicture = await owner.api.get(`/api/library/items/${pictureId}/content`, { headers: owner.headers }); assert.deepEqual(await downloadedPicture.body(), image);
  await page.setViewportSize({ width: 390, height: 844 }); await record('mobile-private-picture');
  await page.getByRole('button', { name: /^More/ }).click(); assert.equal(await page.getByRole('dialog').locator('.wk-sidebar-storage').isVisible(), true);
  await record('mobile-storage-navigation'); await page.keyboard.press('Escape');
  await go('/library/storage'); assert.equal(await page.getByRole('button', { name: 'Paid plans coming later', exact: true }).isDisabled(), true); await page.getByText('Free · 1.0 GB', { exact: true }).waitFor(); await record('mobile-storage-usage');
  await go('/library/pictures'); const usedBefore = (await (await owner.api.get('/api/library/storage', { headers: owner.headers })).json()).usedBytes;
  await action('private.png', 'Move to Trash'); assert.equal((await (await owner.api.get('/api/library/storage', { headers: owner.headers })).json()).usedBytes, usedBefore);
  await go('/library/trash'); await action('private.png', 'Restore'); await go('/library/pictures'); await action('private.png', 'Move to Trash');
  await go('/library/trash'); await action('private.png', 'Delete permanently');
  assert.equal((await owner.api.get(`/api/library/items/${pictureId}/content`, { headers: owner.headers })).status(), 404);
  await go('/library/documents'); await action('private.ts', 'Move to Trash'); await go('/library/trash'); await action('private.ts', 'Delete permanently');
  assert.equal((await owner.api.post('/api/library/items/trash', { headers: owner.headers, data: { ids: extraDocuments } })).status(), 204);
  assert.equal((await owner.api.post('/api/library/items/purge', { headers: owner.headers, data: { ids: extraDocuments } })).status(), 204);
  let usage;
  for (let attempt = 0; attempt < 40; attempt++) { usage = await (await owner.api.get('/api/library/storage', { headers: owner.headers })).json(); if (usage.usedBytes === 0 && usage.reservedBytes === 0) break; await new Promise(resolve => setTimeout(resolve, 1000)); }
  assert.equal(usage.usedBytes, 0); assert.equal(usage.reservedBytes, 0); assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ checkpoints, errors, uploads: ['code', 'picture', 'pdf', 'docx', 'xlsx', 'text'], realMalwareRejection: true, privateDownload: true,
    pictureChecksum: createHash('sha256').update(image).digest('hex'), refreshPersistence: true, ownershipIsolation: true, cleanupReleasedCharge: true, noDemoContent: true, accountQuotaBytes: 1_000_000_000, apiRestartPersistence: Boolean(process.env.WUKNA_LIBRARY_RESTART_API) }, null, 2));
  console.log('Real storage browser flow passed: upload, scan rejection, reload, private preview/download, ownership, mobile navigation, Trash/restore/purge and confirmed cleanup.');
} catch (error) {
  if (page) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); await fs.writeFile(`${output}/failure.txt`, (await page.locator('body').innerText()).slice(0, 16000)).catch(() => {}); }
  throw error;
} finally { await context?.close(); await Promise.all(contexts.map(api => api.dispose())); await browser.close(); }
