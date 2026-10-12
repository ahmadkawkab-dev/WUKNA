import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { browser, setup, visit, inspect, output } from './browser-ui-audit.mjs';
import { fixtures, id } from './ui-audit-fixtures.mjs';

// Presentation-only, explicitly run in a disposable Opera profile. No live writes.
const results = [];
const touchOnly = process.env.WUKNA_CONTROLS_TOUCH_ONLY === '1';
const routes = ['/home', '/boards', '/tasks', '/tasks/quick', '/tasks/templates', '/calendar', '/notifications', '/account/profile', '/library', '/library/pictures', '/library/documents', '/library/videos', '/library/collections', '/library/favorites', '/library/trash', '/library/search', '/library/storage', `/boards/${id(2)}`];
const appearance = control => control.evaluate(element => {
  const style = getComputedStyle(element), rect = element.getBoundingClientRect();
  return { background: style.backgroundColor, color: style.color, shadow: style.boxShadow, outline: style.outlineColor, outlineStyle: style.outlineStyle, offset: style.outlineOffset, width: rect.width, height: rect.height, transition: style.transitionDuration, properties: style.transitionProperty };
});
try {
  for (const theme of touchOnly ? [] : ['light', 'dark']) for (const width of [390, 1440]) {
    const env = await setup({ theme, width, reducedMotion: 'no-preference' });
    env.page.setDefaultTimeout(10_000);
    for (const route of routes) {
      console.log(`Checking controls ${theme} ${width} ${route}`);
      await visit(env, route);
      const scan = await inspect(env.page);
      assert.deepEqual(scan.contrasts, [], `${route} contrast`);
      assert.deepEqual(scan.outliers, [], `${route} bounds`);
      assert.deepEqual(scan.unnamed, [], `${route} accessible names`);
      assert.ok(scan.scrollWidth <= width, `${route} overflow`);
      const button = env.page.locator('.wk-feature-stage button:not(:disabled):not([aria-disabled="true"])').filter({ visible: true }).first();
      if (await button.count()) {
        await env.page.mouse.move(0, 0); await env.page.waitForTimeout(160);
        const before = await appearance(button);
        await button.hover(); await env.page.waitForTimeout(160);
        const hovered = await appearance(button);
        assert.equal(hovered.width, before.width); assert.equal(hovered.height, before.height);
        await env.page.mouse.down();
        await env.page.mouse.move(0, 0); await env.page.mouse.up(); await env.page.waitForTimeout(160);
        const after = await appearance(button);
        assert.equal(after.width, before.width); assert.equal(after.height, before.height);
        assert.equal(after.background, before.background, `${route} hover clears`);
        assert.equal(after.shadow, before.shadow, `${route} press clears`);
        assert.ok(after.outline === 'rgba(0, 0, 0, 0)' || after.outlineStyle === 'none', `${route} pointer focus ring clears`);
      }
      assert.deepEqual(env.errors, [], `${route} exceptions`);
      assert.deepEqual(env.missing, [], `${route} fixture coverage`);
      results.push({ theme, width, route, passed: true });
    }
    await visit(env, '/library/documents');
    const sort = env.page.getByLabel('Sort items', { exact: true });
    await sort.click(); await env.page.waitForTimeout(160);
    assert.equal(await sort.evaluate(element => element.matches(':open')), true, 'native dropdown opens');
    assert.equal((await appearance(sort)).outlineStyle, 'solid', 'open dropdown has a transient ring');
    await env.page.keyboard.press('Escape');
    await sort.dispatchEvent('pointerdown'); await env.page.waitForTimeout(160);
    assert.equal(await sort.evaluate(element => element.matches(':open')), false);
    assert.equal((await appearance(sort)).outline, 'rgba(0, 0, 0, 0)', 'closed pointer dropdown clears its ring');
    await env.page.keyboard.press('Tab'); await sort.focus(); await env.page.waitForTimeout(160);
    const keyboard = await appearance(sort);
    assert.equal(keyboard.outlineStyle, 'solid');
    assert.notEqual(keyboard.outline, 'rgba(0, 0, 0, 0)'); assert.equal(keyboard.offset, '-2px');
    // Model pointer selection without removing DOM focus or opening a native OS menu.
    await sort.dispatchEvent('pointerdown'); await sort.selectOption('name-asc'); await env.page.mouse.move(0, 0); await env.page.waitForTimeout(160);
    const afterSort = await appearance(sort);
    assert.equal(afterSort.outline, 'rgba(0, 0, 0, 0)');
    assert.equal(await sort.evaluate(element => element === document.activeElement), true);
    assert.equal(afterSort.width, keyboard.width); assert.equal(afterSort.height, keyboard.height);
    await env.page.keyboard.press('ArrowDown'); await env.page.waitForTimeout(160);
    assert.notEqual((await appearance(sort)).outline, 'rgba(0, 0, 0, 0)', 'keyboard focus resumes');
    await env.page.screenshot({ path: `${output}/keyboard-${theme}-${width}.png`, fullPage: true });
    await sort.dispatchEvent('pointerdown'); await env.page.waitForTimeout(160);
    await env.page.screenshot({ path: `${output}/pointer-${theme}-${width}.png`, fullPage: true });
    results.push({ theme, width, focus: 'sort pointer/keyboard and stable bounds', passed: true });
    await env.context.close();
  }
  for (const theme of ['light', 'dark']) {
    // A separate context provides actual coarse-pointer/touch media queries.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await fixtures(context, { state: 'empty' });
    await context.addInitScript(theme => localStorage.setItem('wukna.theme.v1', theme), theme);
    const page = await context.newPage();
    await page.goto('http://localhost:5173/library'); await page.locator('.wk-lib-dashboard').waitFor(); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => matchMedia('(hover: hover)').matches), false);
    const button = page.getByRole('button', { name: 'Save video link', exact: true });
    const before = await appearance(button);
    await button.tap(); await page.locator('dialog[open]').waitFor();
    await page.getByRole('button', { name: 'Close Save a video link', exact: true }).tap(); await page.locator('dialog[open]').waitFor({ state: 'hidden' });
    const after = await appearance(button);
    assert.equal(after.background, before.background, 'touch hover does not stick');
    assert.equal(after.shadow, before.shadow, 'touch press clears');
    assert.ok(after.outline === 'rgba(0, 0, 0, 0)' || after.outlineStyle === 'none', 'restored focus does not look pressed');
    assert.equal(after.transition, '0s', 'reduced motion is respected');
    results.push({ theme, touch: true, focus: 'tap/dialog cleanup and reduced motion', passed: true });
    await page.screenshot({ path: `${output}/touch-${theme}.png`, fullPage: true });
    await context.close();
  }
  await fs.writeFile(`${output}/${touchOnly ? 'touch' : 'control'}-results.json`, JSON.stringify(results, null, 2));
  console.log(`Passed ${results.length} control interaction checks.`);
} finally { await browser.close(); }
