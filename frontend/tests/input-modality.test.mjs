import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { initializeInputModality } from '../src/components/ui/inputModality.ts';

test('pointer actions clear visual keyboard mode without blurring controls; keyboard navigation restores it', () => {
  const dom = new JSDOM('<button>Action</button><select><option>First</option></select>');
  const document = dom.window.document;
  const dispose = initializeInputModality(document);
  const select = document.querySelector('select');
  select.focus();
  select.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
  assert.equal(document.documentElement.dataset.inputModality, 'pointer');
  assert.equal(document.activeElement, select, 'pointer cleanup does not steal keyboard focus');
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
  assert.equal(document.documentElement.dataset.inputModality, 'pointer');
  for (const key of ['Tab', 'ArrowDown', 'Enter', 'Escape', 'k']) {
    select.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    select.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, ctrlKey: key === 'k', bubbles: true }));
    assert.equal(document.documentElement.dataset.inputModality, 'keyboard');
  }
  dispose();
  assert.equal(document.documentElement.dataset.inputModality, undefined);
  select.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
  assert.equal(document.documentElement.dataset.inputModality, undefined, 'cleanup removes listeners');
  dom.window.close();
});
