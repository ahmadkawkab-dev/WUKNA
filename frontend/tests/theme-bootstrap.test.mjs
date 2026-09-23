import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const bootstrap = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
function boot(saved, systemDark, blocked = false) {
  const root = { dataset: {}, style: {} };
  runInNewContext(bootstrap, {
    document: { documentElement: root },
    window: { matchMedia: () => ({ matches: systemDark }) },
    localStorage: { getItem: () => { if (blocked) throw new Error('Storage disabled'); return saved; } },
  });
  return root;
}

test('first paint follows the OS when there is no stored preference', () => {
  assert.equal(boot(null, true).dataset.theme, 'dark');
  assert.equal(boot(null, false).dataset.theme, 'light');
});
test('explicit preference overrides the OS before first paint', () => {
  assert.equal(boot('light', true).dataset.theme, 'light');
  assert.equal(boot('dark', false).dataset.theme, 'dark');
});
test('invalid and unavailable storage fall back to system without breaking startup', () => {
  for (const saved of ['invalid', 'system', '', null]) {
    assert.equal(boot(saved, true).dataset.themePreference, 'system');
    assert.equal(boot(saved, true).style.colorScheme, 'dark');
  }
  assert.equal(boot(null, true, true).dataset.theme, 'dark');
});
