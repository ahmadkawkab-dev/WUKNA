import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  collaboratorInitials,
  collaboratorName,
  stablePaletteIndex,
} from '../src/features/boards/collaboratorIdentity.ts';
import {
  noteAppearanceStyle,
  noteDestructiveForeground,
  noteForeground,
  notePigments,
} from '../src/features/boards/noteAppearance.ts';
import { clampDimension, noteDimensionBounds } from '../src/features/boards/noteDimensions.ts';
import {
  connectedNoteIds,
  nearestConnectionPath,
  notesAreConnected,
} from '../src/features/boards/connectionGeometry.ts';

test('collaborator identity is stable and stays inside the curated palette', () => {
  const userId = 'c2e69fee-aec5-4b31-84e0-2b55dc4cf1b9';
  const first = stablePaletteIndex(userId);
  assert.equal(stablePaletteIndex(userId), first);
  assert.ok(first >= 0 && first < 6);
  assert.equal(collaboratorName('maya.ali@example.com'), 'Maya Ali');
  assert.equal(collaboratorInitials('Maya Ali'), 'MA');
});

test('note foreground selection preserves contrast for light and dark pigments', () => {
  assert.equal(noteForeground('#EEE8DB'), '#182018');
  assert.equal(noteForeground('#1D3841'), '#FFFDF8');
  for (const pigment of notePigments) {
    assert.match(pigment.value, /^#[0-9A-F]{6}$/);
    assert.equal(noteForeground(pigment.value), '#182018');
  }
  assert.equal(noteForeground('#777777'), '#000000');
  assert.equal(noteAppearanceStyle('#EEE8DB')['--note-background'], '#EEE8DB');
  assert.equal(noteAppearanceStyle('#EEE8DB').colorScheme, 'light');
  assert.equal(noteAppearanceStyle('#1D3841').colorScheme, 'dark');
  assert.equal(noteDestructiveForeground('#EEE8DB'), 'var(--destructive-on-light-content)');
  assert.equal(noteDestructiveForeground('#1D3841'), 'var(--destructive-on-dark-content)');
  assert.equal(noteAppearanceStyle('#EEE8DB')['--note-destructive'], 'var(--destructive-on-light-content)');
});

test('connections use the nearest note sides and treat direction as one relationship', () => {
  const source = { positionX: 0, positionY: 0, width: 100, height: 100 };
  const right = { positionX: 300, positionY: 0, width: 100, height: 100 };
  const below = { positionX: 0, positionY: 300, width: 100, height: 100 };
  assert.equal(nearestConnectionPath(source, right), 'M 100 50 C 184 50, 216 50, 300 50');
  assert.equal(nearestConnectionPath(source, below), 'M 50 100 C 50 184, 50 216, 50 300');

  const edges = [{ sourceNoteId: 'note-1', targetNoteId: 'note-2' }];
  assert.equal(notesAreConnected('note-1', 'note-2', edges), true);
  assert.equal(notesAreConnected('note-2', 'note-1', edges), true);
  assert.deepEqual([...connectedNoteIds('note-2', edges)], ['note-1']);
});

test('desktop properties uses a right-side layout dock instead of an overlay', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles/board-foundation.css', import.meta.url), 'utf8');
  const canvas = source.indexOf('className="canvas"');
  const inspector = source.indexOf('{inspectorNote && (', canvas);
  const ruleStart = styles.indexOf('.editor-panel {\n  --inspector-width');
  const rule = ruleStart < 0 ? '' : styles.slice(ruleStart, styles.indexOf('\n}', ruleStart));

  assert.ok(canvas >= 0 && inspector > canvas, 'the inspector should follow the canvas in the flex layout');
  assert.match(rule, /position:\s*relative/);
  assert.doesNotMatch(rule, /position:\s*(?:absolute|fixed)/);
  assert.match(rule, /border-inline-start/);
  assert.match(styles, /\.canvas \{[\s\S]*?overflow:\s*auto/);
});

test('resize bounds grow with checklist content and keep cards finite', () => {
  const task = { kind: 1, title: 'Launch checklist', content: '', width: 285 };
  const short = noteDimensionBounds(task, [{ title: 'Write copy' }]);
  const long = noteDimensionBounds(task, Array.from({ length: 9 }, (_, index) => ({ title: `Review launch item ${index + 1}` })));
  assert.ok(long.minHeight > short.minHeight);
  assert.ok(long.minHeight <= long.maxHeight);
  assert.equal(clampDimension(10, long.minHeight, long.maxHeight), long.minHeight);
  assert.equal(clampDimension(10000, long.minHeight, long.maxHeight), long.maxHeight);
  assert.ok(noteDimensionBounds({ kind: 0, title: 'A note', content: 'Useful text', width: 260 }, []).minHeight < long.minHeight);
});
