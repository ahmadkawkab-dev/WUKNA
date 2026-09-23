import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorDraftStore } from '../src/features/boards/editor/draftStore.ts';
import { EditorStateController } from '../src/features/boards/editor/editorStateController.ts';

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

const note = (id = 'note-1', version = 4, title = 'A note', content = 'Body') => ({
  id,
  boardId: 'board-1',
  title,
  content,
  version,
});

function setup(storage = new MemoryStorage(), userId = 'user-1') {
  const controller = new EditorStateController(
    userId,
    'board-1',
    createEditorDraftStore(storage),
  );
  controller.hydrate([note(), note('note-2', 2, 'Second', '')]);
  return { controller, storage };
}

test('selection stays separate from inspector and explicit editing state', () => {
  const { controller } = setup();
  controller.select('note-1');
  assert.equal(controller.getNavigation().selectedNoteId, 'note-1');
  assert.equal(controller.getNavigation().inspectorNoteId, null);
  assert.equal(controller.getNavigation().editingNoteId, null);
  controller.openInspector('note-1');
  assert.equal(controller.getNavigation().inspectorNoteId, 'note-1');
  controller.closeInspector();
  controller.startEditing('note-1');
  assert.equal(controller.getNavigation().editingNoteId, 'note-1');
});

test('opening and closing properties cannot mutate note world coordinates', () => {
  const { controller } = setup();
  const geometry = Object.freeze({ positionX: 640, positionY: 280 });
  controller.select('note-1');
  controller.openInspector('note-1');
  controller.closeInspector();
  assert.deepEqual(geometry, { positionX: 640, positionY: 280 });
  assert.equal(controller.getNavigation().selectedNoteId, 'note-1');
});

test('draft survives note switching, inspector close, and responsive presentation changes', () => {
  const { controller } = setup();
  controller.updateDraft(note(), { content: 'Unsaved local body' }, 10);
  controller.select('note-2');
  controller.select('note-1');
  controller.openInspector('note-1');
  controller.closeInspector();
  controller.setPresentation('mobile');
  controller.setPresentation('desktop');
  assert.equal(controller.getDraft('note-1')?.content, 'Unsaved local body');
  assert.equal(controller.getNavigation().inspectorNoteId, null);
  assert.equal(controller.getNavigation().focusReturnNoteId, 'note-1');
});

test('same-session reload restores a matching-version draft', () => {
  const storage = new MemoryStorage();
  const first = setup(storage).controller;
  first.updateDraft(note(), { title: 'Recovered title' }, 20);

  const reloaded = setup(storage).controller;
  assert.equal(reloaded.getDraft('note-1')?.title, 'Recovered title');
  assert.equal(reloaded.getDraft('note-1')?.baseVersion, 4);
  assert.equal(reloaded.getDraft('note-1')?.recovery, 'current');
});

test('newer authoritative version preserves local draft and marks recovery stale', () => {
  const { controller } = setup();
  controller.updateDraft(note(), { content: 'Local work' }, 30);
  controller.reconcileAuthoritative(note('note-1', 5, 'Server title', 'Server body'));
  assert.equal(controller.getDraft('note-1')?.content, 'Local work');
  assert.equal(controller.getDraft('note-1')?.baseVersion, 4);
  assert.equal(controller.getDraft('note-1')?.serverVersion, 5);
  assert.equal(controller.getDraft('note-1')?.recovery, 'stale');
});

test('successful save clears a matching draft and failed save leaves it untouched', () => {
  const { controller } = setup();
  controller.updateDraft(note(), { title: 'Local title' }, 40);
  const beforeFailure = controller.getDraft('note-1');
  assert.equal(controller.getDraft('note-1'), beforeFailure);

  controller.reconcileSaved(note('note-1', 5, 'Local title', 'Body'));
  assert.equal(controller.getDraft('note-1'), null);
});

test('partial successful save rebases remaining unsaved text onto the new xmin', () => {
  const { controller } = setup();
  controller.updateDraft(note(), { title: 'Saved title', content: 'Still local' }, 50);
  controller.reconcileSaved(note('note-1', 5, 'Saved title', 'Body'));
  assert.equal(controller.getDraft('note-1')?.content, 'Still local');
  assert.equal(controller.getDraft('note-1')?.baseVersion, 5);
  assert.equal(controller.getDraft('note-1')?.recovery, 'current');
});

test('clean remote update creates no draft while dirty remote update cannot overwrite one', () => {
  const { controller } = setup();
  controller.reconcileAuthoritative(note('note-1', 5, 'Remote', 'Remote body'));
  assert.equal(controller.getDraft('note-1'), null);

  controller.updateDraft(note('note-1', 5, 'Remote', 'Remote body'), { content: 'Mine' }, 60);
  controller.reconcileAuthoritative(note('note-1', 6, 'Remote again', 'Changed'));
  assert.equal(controller.getDraft('note-1')?.content, 'Mine');
  assert.equal(controller.getDraft('note-1')?.recovery, 'stale');
});

test('deleting a note removes its draft and every editor reference', () => {
  const { controller } = setup();
  controller.updateDraft(note(), { title: 'Delete me' }, 70);
  controller.openInspector('note-1');
  controller.startEditing('note-1');
  controller.removeNote('note-1');
  assert.equal(controller.getDraft('note-1'), null);
  assert.equal(controller.getNavigation().selectedNoteId, null);
  assert.equal(controller.getNavigation().editingNoteId, null);
  assert.equal(controller.getNavigation().inspectorNoteId, null);
});

test('session drafts are isolated by user and board', () => {
  const storage = new MemoryStorage();
  const first = setup(storage, 'user-1').controller;
  first.updateDraft(note(), { content: 'Private draft' }, 80);

  const otherUser = setup(storage, 'user-2').controller;
  assert.equal(otherUser.getDraft('note-1'), null);

  const otherBoard = new EditorStateController(
    'user-1',
    'board-2',
    createEditorDraftStore(storage),
  );
  otherBoard.hydrate([{ ...note(), boardId: 'board-2' }]);
  assert.equal(otherBoard.getDraft('note-1'), null);
});
