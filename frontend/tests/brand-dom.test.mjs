import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const require = createRequire(import.meta.url);
const compiled = await build({ stdin: { contents: `export { BrandMark } from './src/components/brand/BrandMark';
  export { BrandState, BrandRecovery } from './src/components/brand/BrandState';
  export { Wordmark } from './src/components/brand/Wordmark';
  export { LoadingSkeleton } from './src/components/ui/LoadingSkeleton';
  export { Button } from './src/components/ui/Button';
  export { RealtimeHealth } from './src/features/boards/RealtimeHealth';
  export { brandFaces } from './src/assets/brand/geometry';
  export { prismPathsAt, prismDuration, prismFoldAt, prismYawAt, prismSpinStart, prismSpinEnd, prismFrameAt } from './src/assets/brand/prismMotion';`, resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'brand-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const components = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
async function withDom(run) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] });
  const root = createRoot(document.getElementById('root'));
  const render = element => act(async () => root.render(element));
  try { await run({ render }); }
  finally { await act(async () => root.unmount()); dom.window.close(); for (const [name, previous] of originals) { if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name]; } }
}

test('the approved W always retains eight named faces, including compact and animated treatments', () => withDom(async ({ render }) => {
  for (const motion of ['still', 'loading', 'welcome', 'success', 'neon']) {
    await render(React.createElement(components.BrandMark, { motion, width: 16, height: 16, fill: 'red' }));
    const svg = document.querySelector('svg');
    assert.equal(svg.getAttribute('viewBox'), '90 150 425 300');
    assert.equal(svg.querySelectorAll('[data-brand-face]').length, 8);
    assert.equal(new Set([...svg.querySelectorAll('[data-brand-face]')].map(p => p.dataset.brandFace)).size, 8);
    assert.equal(svg.querySelectorAll('.wk-brand-panel').length, 3);
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(svg.getAttribute('focusable'), 'false');
  }
}));

test('the approved prism loop returns to the canonical rounded W without a boundary jump', () => {
  const canonical = components.brandFaces.map(face => face.path.replace(/\s/g, ''));
  for (const time of [0, components.prismDuration - 500, components.prismDuration]) {
    assert.deepEqual(components.prismPathsAt(time).map(path => path.replace(/\s/g, '')), canonical);
  }
  const closed = components.prismPathsAt(2600);
  assert.equal(closed.length, 8);
  assert.notDeepEqual(closed, components.prismPathsAt(0));
  for (const time of [1400, 2600, 3850]) {
    assert.deepEqual(components.prismPathsAt(time), components.prismPathsAt(time + components.prismDuration));
  }
});

test('the prism stays folded for a complete 360-degree turn, exposes reverse faces, then unfolds', () => {
  const { prismSpinStart: start, prismSpinEnd: end, prismYawAt: yaw, prismFoldAt: fold, prismFrameAt: frame } = components;
  assert.equal(yaw(start), 0); assert.equal(yaw(end), Math.PI * 2);
  let previous = 0;
  for (let time = start; time <= end; time += 100) {
    assert.equal(fold(time), 1);
    assert.ok(yaw(time) >= previous); previous = yaw(time);
    const geometry = frame(time);
    assert.ok(geometry.visible.filter(Boolean).length + geometry.back.filter(face => face.visible).length >= 6);
    assert.ok([...geometry.paths, ...geometry.back.map(face => face.path)].every(path => !/NaN|Infinity/.test(path)));
  }
  const reversed = frame((start + end) / 2);
  assert.deepEqual(reversed.visible, [false, false, true, true, false, false, false, false]);
  assert.ok(reversed.back.every(face => face.visible));
  assert.deepEqual(frame(start), frame(end), 'the full turn returns to its exact starting geometry before unfolding');
  assert.ok(fold(end + 300) < 1);
  assert.ok(frame(0).back.every(face => !face.visible && face.path === ''));
});

function controlledMotion() {
  let next = 0, hidden = false;
  const frames = new Map(), listeners = new Set();
  const media = { matches: false, addEventListener: (_name, listener) => listeners.add(listener), removeEventListener: (_name, listener) => listeners.delete(listener) };
  window.matchMedia = () => media;
  window.requestAnimationFrame = callback => { const id = ++next; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  return { frames, listeners,
    tick(now) { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now)); },
    reduce(value) { media.matches = value; listeners.forEach(listener => listener()); },
    hide(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
  };
}

test('workspace prism playback pauses in hidden tabs, honors reduced motion, and disposes immediately when ready', () => withDom(async ({ render }) => {
  const motion = controlledMotion();
  await render(React.createElement(React.StrictMode, null, React.createElement(components.BrandState, { fullscreen: true, motion: 'prism', label: 'Opening your workspace…' })));
  assert.equal(motion.frames.size, 1, 'Strict Mode retains one playback loop');
  assert.equal(motion.listeners.size, 1);
  const svg = document.querySelector('.wk-brand-mark--prism');
  assert.equal(svg.querySelectorAll('[data-brand-face]').length, 8);
  const paths = () => [...svg.querySelectorAll('[data-brand-face]')].map(path => path.getAttribute('d'));
  motion.tick(0);
  for (let now = 100; now <= 3800; now += 100) motion.tick(now);
  assert.deepEqual(paths(), components.prismPathsAt(3800));
  assert.ok([...svg.querySelectorAll('[data-brand-back]')].every(path => path.getAttribute('visibility') === 'visible'));
  motion.hide(true);
  assert.equal(motion.frames.size, 0);
  const paused = paths();
  motion.hide(false); motion.tick(10_000);
  assert.deepEqual(paths(), paused, 'resuming a hidden tab does not skip through the loop');
  motion.reduce(true);
  assert.equal(motion.frames.size, 0);
  assert.deepEqual(paths(), components.brandFaces.map(face => face.path));
  assert.ok([...svg.querySelectorAll('[data-brand-back]')].every(path => path.getAttribute('visibility') === 'hidden'));
  motion.reduce(false); motion.tick(10_100);
  for (let now = 10_200; now <= 11_500; now += 100) motion.tick(now);
  await render(React.createElement('p', null, 'Workspace ready'));
  assert.equal(document.querySelector('.wk-brand-state'), null);
  assert.equal(motion.frames.size, 0, 'readiness cancels the animation mid-fold');
  assert.equal(motion.listeners.size, 0);
}));

test('one opening clock preserves the prism phase through recovery, retry and workspace fallback remounts', () => withDom(async ({ render }) => {
  const motion = controlledMotion(), playback = { elapsed: 0 };
  const paths = () => [...document.querySelectorAll('.wk-brand-mark--prism [data-brand-face]')].map(path => path.getAttribute('d'));
  await render(React.createElement(React.StrictMode, null, React.createElement(components.BrandRecovery, {
    playback, reason: 'Could not connect to Wukna. Try again.', onRetry: () => {},
  })));
  motion.tick(0); for (let now = 100; now <= 3800; now += 100) motion.tick(now);
  const rotating = paths(); assert.equal(playback.elapsed, 3800);
  await render(React.createElement(React.StrictMode, null, React.createElement(components.BrandState, {
    playback, fullscreen: true, motion: 'prism', label: 'Restoring your session…',
  })));
  assert.deepEqual(paths(), rotating, 'retry draws the preserved phase before its first animation frame');
  assert.equal(motion.frames.size, 1); motion.tick(3900); motion.tick(4000);
  assert.equal(playback.elapsed, 3900);
  await render(React.createElement('section', null, React.createElement(components.BrandState, {
    playback, fullscreen: true, motion: 'prism', label: 'Opening your workspace…',
  })));
  assert.deepEqual(paths(), components.prismPathsAt(3900), 'a different workspace fallback tree keeps the same opening clock');
  assert.equal(motion.frames.size, 1);
  await render(React.createElement('p', null, 'Workspace ready'));
  assert.equal(motion.frames.size, 0); assert.equal(motion.listeners.size, 0);
}));

test('failed session recovery keeps looping through the prism, shows the actual reason, and supports retry without claiming to be busy', () => withDom(async ({ render }) => {
  const motion = controlledMotion();
  let retries = 0;
  await render(React.createElement(components.BrandRecovery, { reason: 'Wukna had a server error. Try again shortly.', onRetry: () => { retries += 1; } }));
  assert.match(document.querySelector('[role="alert"]').textContent, /Could not restore your session.*Wukna had a server error/);
  assert.equal(document.querySelector('[aria-busy="true"]'), null);
  assert.equal(document.querySelectorAll('.wk-brand-recovery .wk-brand-state-lockup [data-brand-face]').length, 8);
  const svg = document.querySelector('.wk-brand-recovery .wk-brand-mark--prism');
  const paths = () => [...svg.querySelectorAll('[data-brand-face]')].map(path => path.getAttribute('d'));
  motion.tick(0);
  for (let now = 100; now <= components.prismDuration + 2600; now += 100) {
    motion.tick(now);
    if (now === 2600 || now === components.prismDuration + 2600) {
      assert.deepEqual(paths(), components.prismPathsAt(2600), 'the prism keeps playing after a failed request, including subsequent cycles');
    }
  }
  assert.equal(motion.frames.size, 1);
  motion.reduce(true);
  assert.deepEqual(paths(), components.brandFaces.map(face => face.path));
  assert.equal(motion.frames.size, 0);
  await act(async () => document.querySelector('button').click());
  assert.equal(retries, 1);
}));

test('startup and shared loading show labeled feedback immediately and release ready content without a minimum duration', () => withDom(async ({ render }) => {
  await render(React.createElement(components.BrandState, { fullscreen: true, label: 'Restoring your session…' }));
  assert.match(document.querySelector('[role="status"]').textContent, /Restoring your session/);
  assert.equal(document.querySelector('[aria-busy="true"]').classList.contains('wk-brand-state--fullscreen'), true);
  await render(React.createElement('p', null, 'Workspace ready'));
  assert.equal(document.querySelector('.wk-brand-state'), null);
  assert.equal(document.querySelector('p').textContent, 'Workspace ready');
  await render(React.createElement(components.LoadingSkeleton, { label: 'Loading Library content' }));
  assert.equal(document.querySelector('[role="status"]').getAttribute('aria-label'), 'Loading Library content');
  assert.equal(document.querySelector('.wk-loading-brand [data-brand-face]') !== null, true);
  await render(React.createElement(components.Wordmark));
  assert.equal(document.querySelector('.wukna-wordmark > span').textContent, 'wukna');
}));

test('pending buttons keep their disabled and accessible state, and remove loading motion on readiness', () => withDom(async ({ render }) => {
  await render(React.createElement(components.Button, { loading: true, loadingLabel: 'Saving…' }, 'Save'));
  assert.equal(document.querySelector('button').disabled, true);
  assert.equal(document.querySelector('button').getAttribute('aria-busy'), 'true');
  assert.match(document.querySelector('.wk-button-progress').textContent, /Saving/);
  assert.equal(document.querySelectorAll('.wk-button-progress [data-brand-face]').length, 8);
  await render(React.createElement(components.Button, { loading: false }, 'Save'));
  assert.equal(document.querySelector('button').disabled, false);
  assert.equal(document.querySelector('button').getAttribute('aria-busy'), null);
  assert.equal(document.querySelector('.wk-brand-mark--loading'), null);
}));

test('collaboration reconnecting and recovery retain truthful live status without a blocking screen', () => withDom(async ({ render }) => {
  await render(React.createElement(components.RealtimeHealth, { status: 'connecting' }));
  assert.match(document.querySelector('[role="status"]').textContent, /Connecting live collaboration/);
  await render(React.createElement(components.RealtimeHealth, { status: 'reconnecting' }));
  assert.match(document.querySelector('[role="status"]').textContent, /Reconnecting/);
  assert.equal(document.querySelectorAll('[data-brand-face]').length, 8);
  await render(React.createElement(components.RealtimeHealth, { status: 'connected' }));
  assert.equal(document.querySelector('[role="status"]'), null, 'first connection does not show a false recovery');
  await render(React.createElement(components.RealtimeHealth, { status: 'reconnecting' }));
  await render(React.createElement(components.RealtimeHealth, { status: 'connected' }));
  assert.match(document.querySelector('[role="status"]').textContent, /Back online/);
  assert.ok(document.querySelector('.wk-brand-mark--success'));
}));
