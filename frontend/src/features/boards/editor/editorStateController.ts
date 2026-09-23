import {
  clearEditorBoardState,
  closeEditorInspector,
  createEditorState,
  hydrateEditorDrafts,
  markEditorConflict,
  openEditorInspector,
  reconcileEditorAuthoritative,
  reconcileEditorSaved,
  removeNoteEditorState,
  selectEditorNote,
  setEditorPresentation,
  startEditorEditing,
  stopEditorEditing,
  updateNoteDraft,
  type EditorNavigationState,
  type EditorNoteSnapshot,
  type EditorPresentation,
  type EditorState,
  type NoteDraft,
  type StoredNoteDraft,
} from "./editorState.ts";
import type { EditorDraftStore } from "./draftStore.ts";

type Listener = () => void;

export class EditorStateController {
  private state: EditorState;
  private readonly listeners = new Set<Listener>();
  private readonly storedDrafts: StoredNoteDraft[];
  private readonly userId: string;
  private readonly boardId: string;
  private readonly store: EditorDraftStore;
  private hydrated = false;

  constructor(
    userId: string,
    boardId: string,
    store: EditorDraftStore,
    presentation: EditorPresentation = "desktop",
  ) {
    this.userId = userId;
    this.boardId = boardId;
    this.store = store;
    this.state = createEditorState(presentation);
    this.storedDrafts = store.load(userId, boardId);
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getNavigation = (): EditorNavigationState => this.state.navigation;
  getDraft = (noteId: string): NoteDraft | null => this.state.drafts[noteId] ?? null;
  getDrafts = (): Record<string, NoteDraft> => this.state.drafts;

  private replace(next: EditorState, persist = true) {
    if (next === this.state) return;
    this.state = next;
    if (persist) this.store.save(this.userId, this.boardId, next.drafts);
    for (const listener of this.listeners) listener();
  }

  hydrate(notes: readonly EditorNoteSnapshot[]) {
    if (!this.hydrated) {
      this.hydrated = true;
      this.replace(hydrateEditorDrafts(this.state, this.storedDrafts, notes));
      return;
    }
    let next = this.state;
    const noteIds = new Set(notes.map((note) => note.id));
    for (const noteId of Object.keys(next.drafts)) {
      if (!noteIds.has(noteId)) next = removeNoteEditorState(next, noteId);
    }
    for (const note of notes) next = reconcileEditorAuthoritative(next, note);
    this.replace(next);
  }

  select(noteId: string | null) {
    this.replace(selectEditorNote(this.state, noteId), false);
  }

  startEditing(noteId: string) {
    this.replace(startEditorEditing(this.state, noteId), false);
  }

  stopEditing(noteId?: string) {
    this.replace(stopEditorEditing(this.state, noteId), false);
  }

  openInspector(noteId: string) {
    this.replace(openEditorInspector(this.state, noteId), false);
  }

  closeInspector() {
    this.replace(closeEditorInspector(this.state), false);
  }

  setPresentation(presentation: EditorPresentation) {
    this.replace(setEditorPresentation(this.state, presentation), false);
  }

  updateDraft(
    note: EditorNoteSnapshot,
    changes: Partial<Pick<NoteDraft, "title" | "content">>,
    updatedAt = Date.now(),
  ) {
    this.replace(updateNoteDraft(this.state, note, changes, updatedAt));
  }

  reconcileAuthoritative(note: EditorNoteSnapshot) {
    this.replace(reconcileEditorAuthoritative(this.state, note));
  }

  markConflict(noteId: string, serverVersion?: number) {
    this.replace(markEditorConflict(this.state, noteId, serverVersion));
  }

  reconcileSaved(note: EditorNoteSnapshot) {
    this.replace(reconcileEditorSaved(this.state, note));
  }

  removeNote(noteId: string) {
    this.replace(removeNoteEditorState(this.state, noteId));
  }

  clearBoard() {
    this.store.clearBoard(this.userId, this.boardId);
    this.replace(clearEditorBoardState(this.state), false);
  }
}
