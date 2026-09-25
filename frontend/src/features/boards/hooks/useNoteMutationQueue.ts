import { useCallback, useRef, type RefObject } from "react";
import { AuthApiError, type NoteDto } from "../../../api";

export const isNoteConflict = (error: unknown) =>
  error instanceof AuthApiError && error.code === "note_version_conflict";

export function useNoteMutationQueue(notesRef: RefObject<NoteDto[]>) {
  const mutationQueues = useRef(new Map<string, Promise<void>>());
  const blockedNotes = useRef(new Set<string>());
  const enqueueNote = useCallback(<T,>(
    noteId: string,
    action: (current: NoteDto) => Promise<T>,
  ): Promise<T> => {
    const previous = mutationQueues.current.get(noteId) ?? Promise.resolve();
    const operation = previous.then(async () => {
      if (blockedNotes.current.has(noteId))
        throw new AuthApiError("note_version_conflict", 409);
      const current = notesRef.current.find((note) => note.id === noteId);
      if (!current) throw new AuthApiError("not_found", 404);
      try {
        return await action(current);
      } catch (cause) {
        if (isNoteConflict(cause)) blockedNotes.current.add(noteId);
        throw cause;
      }
    });
    const tail = operation.then(() => undefined, () => undefined);
    mutationQueues.current.set(noteId, tail);
    void tail.then(() => {
      if (mutationQueues.current.get(noteId) === tail)
        mutationQueues.current.delete(noteId);
    });
    return operation;
  }, [notesRef]);

  return { enqueueNote, blockedNotes };
}
