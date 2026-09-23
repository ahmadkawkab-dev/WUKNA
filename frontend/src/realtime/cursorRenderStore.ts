import type { BoardCursorsByConnection } from "./cursors";

/** Cursor packets notify only the cursor layer; board state stays untouched. */
export class CursorRenderStore {
  private cursors: BoardCursorsByConnection = {};
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.cursors;
  set(cursors: BoardCursorsByConnection) {
    if (cursors === this.cursors) return;
    this.cursors = cursors;
    for (const listener of this.listeners) listener();
  }
}
