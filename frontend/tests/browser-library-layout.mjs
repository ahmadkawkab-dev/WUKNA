import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { browser, setup, visit, inspect, output } from './browser-ui-audit.mjs';

// Opt-in presentation checks use intercepted HTTP responses in a disposable
// Opera profile. They never seed application data or call a live mutation API.
const stamp = '2026-10-11T09:00:00Z';
const collection = { id: 'layout-collection', name: 'Saved references', description: 'Related items', itemCount: 0, createdAt: stamp, updatedAt: stamp };
async function libraryFixtures(context, { populated = false, available = false } = {}) {
  await context.route('**/api/library/**', route => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1);
    const send = json => route.fulfill({ json });
    assert.equal(route.request().method(), 'GET');
    if (name === 'capabilities') return send({ storageAvailable: available, checkoutEnabled: false });
    if (name === 'summary') return send({ categories: ['picture', 'document', 'video'].map(category => ({ category, itemCount: 0 })), storage: { quotaBytes: 1_000_000_000, usedBytes: 0, reservedBytes: 0, availableBytes: 1_000_000_000, entitlementSource: 'free' } });
    if (name === 'collections') return send({ items: populated ? [collection] : [], nextCursor: null });
    if (name === 'folders' || name === 'items') return send({ items: [], nextCursor: null });
    throw new Error(`Unhandled presentation request ${url.pathname}`);
  });
  await context.route('**/api/subscriptions/storage-plans', route => route.fulfill({ json: [{ id: 'free', name: 'Free', quotaBytes: 1_000_000_000, checkoutEnabled: false }] }));
}
const routes = ['/library', '/library/pictures', '/library/documents', '/library/videos', '/library/collections', '/library/favorites', '/library/trash', '/library/search', '/library/storage'];
const sampleDisclosure = (page, selector) => page.evaluate(selector => new Promise(resolve => {
  const control = document.querySelector(selector);
  const panel = document.getElementById(control.getAttribute('aria-controls'));
  const duration = getComputedStyle(panel).transitionDuration;
  const samples = [], start = performance.now();
  control.click();
  function frame(time) {
    samples.push({ elapsed: time - start, height: panel.getBoundingClientRect().height, scrollWidth: document.documentElement.scrollWidth });
    if (time - start < 350) requestAnimationFrame(frame);
    else resolve({ duration, samples });
  }
  requestAnimationFrame(frame);
}), selector);
const results = [];
try {
  for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440]) {
    const env = await setup({ theme, width, state: 'empty' });
    env.page.setDefaultTimeout(15_000);
    env.page.setDefaultNavigationTimeout(20_000);
    await libraryFixtures(env.context);
    for (const route of routes) {
      console.log(`Checking ${theme} ${width} ${route}`);
      try { await visit(env, route); }
      catch (failure) { console.error({ route, errors: env.errors, missing: env.missing, body: await env.page.locator('body').innerText() }); throw failure; }
      await env.page.locator('.wk-library').waitFor();
      await env.page.waitForFunction(() => !document.querySelector('.wk-library [aria-busy="true"]'));
      const scan = await inspect(env.page);
      const name = `${theme}-${width}-${route.replaceAll('/', '-').slice(1)}`;
      results.push({ name, ...scan, errors: [...env.errors], missing: [...env.missing] });
      assert.ok(scan.scrollWidth <= width, `${name} overflow`);
      assert.deepEqual(scan.outliers, [], `${name} outliers`);
      assert.deepEqual(scan.unnamed, [], `${name} unnamed controls`);
      assert.deepEqual(scan.contrasts, [], `${name} contrast`);
      assert.deepEqual(env.errors, [], `${name} browser exceptions`);
      assert.deepEqual(env.missing, [], `${name} unexpected API calls`);
      const heading = env.page.locator('.wk-library-content .wk-lib-section-heading > div:first-child').first();
      if (await heading.count()) assert.ok((await heading.boundingBox()).width >= 200, `${name} readable heading width`);
      if (width !== 768 && routes.indexOf(route) < 5) await env.page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
      if (route === '/library') {
        assert.equal(await env.page.locator('.wk-lib-dashboard .wk-lib-state').count(), 1);
        assert.equal(await env.page.getByText('Quick capture', { exact: true }).count(), 0);
      }
    }
    await env.context.close();
  }
  for (const width of [390, 1440]) for (const reducedMotion of ['reduce', 'no-preference']) {
    console.log(`Checking disclosure ${width} ${reducedMotion}`);
    const env = await setup({ width, reducedMotion });
    env.page.setDefaultTimeout(15_000);
    env.page.setDefaultNavigationTimeout(20_000);
    await libraryFixtures(env.context, { populated: true, available: true });
    await visit(env, '/library/pictures');
    await env.page.bringToFront();
    const toggle = width < 768 ? '.wk-library-section-menu > button' : '.wk-sidebar button[aria-label="Library"]';
    if (width >= 768) await env.page.locator(toggle).click();
    await env.page.waitForTimeout(300);
    const frames = await sampleDisclosure(env.page, toggle);
    const closing = await sampleDisclosure(env.page, toggle);
    for (const sample of [frames, closing]) {
      assert.ok(sample.samples.every(frame => frame.scrollWidth <= width));
      if (reducedMotion === 'reduce') assert.equal(sample.duration, '0s');
      else assert.ok(new Set(sample.samples.map(frame => Math.round(frame.height))).size > 2, 'menu moves through intermediate heights');
    }
    await env.page.locator(toggle).click(); await env.page.waitForTimeout(300);
    const nav = width < 768 ? env.page.locator('.wk-library-section-menu .wk-library-navigation') : env.page.locator('.wk-sidebar .wk-library-navigation');
    await nav.getByRole('button', { name: /^Documents/ }).click();
    assert.equal(await env.page.locator(toggle).getAttribute('aria-expanded'), 'true');
    await env.page.locator('h1').filter({ hasText: 'Documents' }).waitFor();
    if (width >= 768) {
      await env.page.locator('.wk-sidebar button[aria-label="Home"]').click();
      assert.equal(await env.page.locator(toggle).getAttribute('aria-expanded'), 'true');
      await env.page.locator(toggle).click();
      assert.equal(new URL(env.page.url()).pathname, '/home');
      assert.equal(await env.page.locator(toggle).getAttribute('aria-expanded'), 'false');
      await env.page.locator(toggle).click();
      await env.page.locator('.wk-library-collection-shortcuts button').click();
      await env.page.getByRole('button', { name: 'Edit collection', exact: true }).waitFor();
      await env.page.reload();
      await env.page.getByRole('button', { name: 'Edit collection', exact: true }).waitFor();
      await env.page.goBack(); await env.page.locator('h1').filter({ hasText: 'Dashboard' }).waitFor();
      await env.page.goForward(); await env.page.getByRole('button', { name: 'Edit collection', exact: true }).waitFor();
    } else {
      await env.page.locator(toggle).click();
      assert.equal(await env.page.locator(toggle).getAttribute('aria-expanded'), 'false');
    }
    results.push({ width, reducedMotion, opening: frames, closing, passed: true });
    await env.context.close();
  }
  await fs.writeFile(`${output}/layout-results.json`, JSON.stringify(results, null, 2));
  console.log(`Passed ${results.length} Library layout/navigation/motion checks.`);
} finally { await browser.close(); }
