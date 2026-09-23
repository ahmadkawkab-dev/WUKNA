import type { NoteDraft, StoredNoteDraft } from "./editorState.ts";

const prefix = "wukna:board-drafts:v1:";

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export type EditorDraftStore = {
  load: (userId: string, boardId: string) => StoredNoteDraft[];
  save: (userId: string, boardId: string, drafts: Record<string, NoteDraft>) => void;
  clearBoard: (userId: string, boardId: string) => void;
  clearUser: (userId: string) => void;
};

function storageKey(userId: string, boardId: string) {
  return `${prefix}${encodeURIComponent(userId)}:${encodeURIComponent(boardId)}`;
}

function validDraft(value: unknown, boardId: string): value is StoredNoteDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<StoredNoteDraft>;
  return typeof draft.noteId === "string" &&
    draft.boardId === boardId &&
    typeof draft.title === "string" &&
    typeof draft.content === "string" &&
    typeof draft.baseVersion === "number" &&
    Number.isInteger(draft.baseVersion) &&
    typeof draft.updatedAt === "number" &&
    Number.isFinite(draft.updatedAt);
}

export function createEditorDraftStore(storage?: DraftStorage): EditorDraftStore {
  const safely = (operation: () => void) => {
    try { operation(); } catch { /* Draft recovery is best-effort when storage is unavailable. */ }
  };
  return {
    load(userId, boardId) {
      if (!storage) return [];
      try {
        const raw = storage.getItem(storageKey(userId, boardId));
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed)
          ? parsed.filter((value) => validDraft(value, boardId))
          : [];
      } catch {
        return [];
      }
    },
    save(userId, boardId, drafts) {
      if (!storage) return;
      safely(() => {
        const values = Object.values(drafts).map<StoredNoteDraft>((draft) => ({
          noteId: draft.noteId,
          boardId: draft.boardId,
          title: draft.title,
          content: draft.content,
          baseVersion: draft.baseVersion,
          updatedAt: draft.updatedAt,
        }));
        const key = storageKey(userId, boardId);
        if (values.length) storage.setItem(key, JSON.stringify(values));
        else storage.removeItem(key);
      });
    },
    clearBoard(userId, boardId) {
      if (!storage) return;
      safely(() => storage.removeItem(storageKey(userId, boardId)));
    },
    clearUser(userId) {
      if (!storage) return;
      safely(() => {
        const userPrefix = `${prefix}${encodeURIComponent(userId)}:`;
        const keys: string[] = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key?.startsWith(userPrefix)) keys.push(key);
        }
        for (const key of keys) storage.removeItem(key);
      });
    },
  };
}
