import type {
  NoteEditingStartedEvent,
  NoteEditingStoppedEvent,
} from "./events";

export type NoteEditingByConnection = Record<string, NoteEditingStartedEvent>;
export type NoteEditingByNote = Record<string, NoteEditingByConnection>;

export function applyEditingStarted(
  current: NoteEditingByNote,
  incoming: NoteEditingStartedEvent,
): NoteEditingByNote {
  const existing = current[incoming.noteId]?.[incoming.connectionId];
  if (existing && incoming.sequence <= existing.sequence) return current;
  return {
    ...current,
    [incoming.noteId]: {
      ...current[incoming.noteId],
      [incoming.connectionId]: incoming,
    },
  };
}

export function applyEditingStopped(
  current: NoteEditingByNote,
  incoming: NoteEditingStoppedEvent,
): NoteEditingByNote {
  const note = current[incoming.noteId];
  const existing = note?.[incoming.connectionId];
  if (!existing || incoming.sequence < existing.sequence) return current;
  const nextNote = { ...note };
  delete nextNote[incoming.connectionId];
  const next = { ...current };
  if (Object.keys(nextNote).length) next[incoming.noteId] = nextNote;
  else delete next[incoming.noteId];
  return next;
}

export function editingUserIds(
  current: NoteEditingByConnection | undefined,
  localUserId: string,
): string[] {
  return [...new Set(Object.values(current ?? {})
    .map((state) => state.userId)
    .filter((userId) => userId !== localUserId))];
}
