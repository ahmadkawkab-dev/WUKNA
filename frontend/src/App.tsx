import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as Pointer,
} from "react";
import {
  ArrowLeft,
  GripVertical,
  Link2,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Settings2,
  Share2,
  Sparkles,
  StickyNote,
  X,
} from "lucide-react";
import {
  currentSession,
  exchangeGoogleCode,
  logout,
  logoutEverywhere,
  restoreSession,
  reconcileSessionUser,
  setSessionExpiredHandler,
  type AuthSession,
} from "./auth";
import {
  AuthApiError,
  boardApi,
  connectionApi,
  errorMessage,
  noteApi,
  profileApi,
  type BoardDetailDto,
  type BoardListItemDto,
  type ConnectionDto,
  type MemberDto,
  type ProfileDto,
  type NoteDto,
  type PatchNote,
} from "./api";
import { AuthScreen } from "./features/auth/AuthScreen";
import { AccountPanel } from "./features/account/AccountPanel";
import { accountSectionForPath } from "./features/account/accountRoute";
import { Wordmark } from "./components/brand/Wordmark";
import { AppShell } from "./components/navigation/AppShell";
import { Notice } from "./components/ui/Notice";
import { Dialog } from "./components/ui/Dialog";
import { Button, IconButton } from "./components/ui/Button";
import { BoardLanding } from "./features/boards/BoardLanding";
import { SoonPage } from "./features/future/PreviewUI";
import { BoardPresence } from "./features/boards/BoardPresence";
import { MemberActionsMenu, memberActionError, type MemberMenuAnchor } from "./features/boards/MemberActionsMenu";
import {
  NoteEditingIndicator,
  type EditingViewer,
} from "./features/boards/NoteEditingIndicator";
import {
  RemoteCursors,
} from "./features/boards/RemoteCursors";
import { isDragGesture } from "./features/boards/gesture";
import { collaboratorInitials, collaboratorStyle } from "./features/boards/collaboratorIdentity";
import { Avatar, identityLabel } from "./components/ui/Avatar";
import { CollaborationAnnouncements } from "./features/boards/CollaborationAnnouncements";
import {
  connectedNoteIds,
  nearestConnectionPath,
  notesAreConnected,
} from "./features/boards/connectionGeometry";
import {
  noteAppearanceStyle,
  notePigments,
} from "./features/boards/noteAppearance";
import { clampDimension, noteDimensionBounds } from "./features/boards/noteDimensions";
import { RealtimeHealth } from "./features/boards/RealtimeHealth";
import {
  clientPointToBoard,
  revealBoardNode,
} from "./features/boards/boardViewport";
import {
  EditorStateProvider,
  useEditorActions,
  useEditorNavigation,
  useNoteDraft,
} from "./features/boards/editor/EditorStateProvider";
import { realtimeConnection } from "./realtime/connection";
import { CursorRenderStore } from "./realtime/cursorRenderStore";
import {
  realtimeEvents,
  type ProfileChangedEvent,
  type UserProfileChangedEvent,
  type BoardScopedEvent,
  type BoardPresenceSnapshot,
  type BoardSummaryChangedEvent,
  type BoardCursorMovedEvent,
  type BoardCursorStoppedEvent,
  type BoardUpdatedEvent,
  type ConnectionCreatedEvent,
  type ConnectionDeletedEvent,
  type NoteChangedEvent,
  type NoteDeletedEvent,
  type NoteGeometryOperation,
  type NoteGeometryPreviewEndedEvent,
  type NoteGeometryPreviewEvent,
  type NoteEditingStartedEvent,
  type NoteEditingStoppedEvent,
} from "./realtime/events";
import {
  mergeBoardSummary,
  mergePresenceSnapshot,
  mergeVersionedNote,
  removeVersionedNote,
  shouldAcceptGeometryPreview,
  shouldClearGeometryPreview,
  shouldEndGeometryPreview,
} from "./realtime/reconcile";
import {
  applyEditingStarted,
  applyEditingStopped,
  editingUserIds,
  type NoteEditingByNote,
} from "./realtime/editing";
import {
  applyCursorMoved,
  applyCursorStopped,
  shouldAcceptCursorMoved,
  type BoardCursorsByConnection,
} from "./realtime/cursors";

type Panel = "tasks" | "share" | "chat" | null;
type VisualPatch = Partial<{
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  color: string;
}>;
type ConnectionDraft = {
  sourceId: string;
  x: number;
  y: number;
  targetId: string | null;
};
type RemoteGeometryPresentation = {
  userId: string;
  label: string;
  initials: string;
  operation: NoteGeometryOperation;
  profileImageUrl?: string | null;
  username?: string | null;
};
const boardFromPath = (path: string) =>
  /^\/boards\/([0-9a-f-]{36})$/i.exec(path)?.[1] ?? null;
const isConflict = (error: unknown) =>
  error instanceof AuthApiError && error.code === "note_version_conflict";
function InlineNoteText({
  note,
  field,
  label,
  editable,
  autoEdit = false,
  activation = "click",
  onSave,
  onEditingChange,
}: {
  note: NoteDto;
  field: "title" | "content";
  label: string;
  editable: boolean;
  autoEdit?: boolean;
  activation?: "click" | "double";
  onSave: (value: string) => Promise<void>;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const draft = useNoteDraft(note.id);
  const editor = useEditorActions();
  const value = draft?.[field] ?? note[field];
  const skipSave = useRef(false);
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const editingAnnounced = useRef(false);
  const editingChangeRef = useRef(onEditingChange);
  useEffect(() => {
    editingChangeRef.current = onEditingChange;
  }, [onEditingChange]);
  useEffect(() => () => {
    if (editingAnnounced.current) editingChangeRef.current?.(false);
  }, []);
  function announceEditing(active: boolean) {
    if (editingAnnounced.current === active) return;
    editingAnnounced.current = active;
    editingChangeRef.current?.(active);
  }
  async function finish(nextValue: string) {
    announceEditing(false);
    editor.stopEditing(note.id);
    setEditing(false);
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (!editableRef.current) return;
    const next = field === "title" ? nextValue.trim() : nextValue;
    if (field === "title" && !next) return;
    if (next !== note[field]) await onSave(next);
  }
  if (editing && editable) {
    const change = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      editor.updateDraft(note, { [field]: event.target.value });
    const focus = () => {
      editor.startEditing(note.id);
      announceEditing(true);
    };
    if (field === "content") return (
      <textarea
        className="inline-edit inline-edit--content"
        aria-label={label}
        autoFocus
        rows={4}
        value={value}
        onFocus={focus}
        onChange={change}
        onBlur={(event) => void finish(event.currentTarget.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            skipSave.current = true;
            event.currentTarget.blur();
          } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    );
    return (
      <input
        className="inline-edit inline-edit--title"
        aria-label={label}
        autoFocus
        maxLength={200}
        value={value}
        onFocus={focus}
        onChange={change}
        onBlur={(event) => void finish(event.currentTarget.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            skipSave.current = true;
            event.currentTarget.blur();
          }
        }}
      />
    );
  }
  return (
    <span
      className={`${editable ? "editable-text" : ""} ${field === "content" ? "note-body-text" : ""}`.trim()}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      title={editable ? (activation === "double" ? "Double-click to edit" : "Click to edit") : undefined}
      onClick={editable && activation === "click" ? (event) => {
        event.stopPropagation();
        setEditing(true);
      } : undefined}
      onDoubleClick={editable && activation === "double" ? (event) => {
        event.stopPropagation();
        setEditing(true);
      } : undefined}
      onKeyDown={editable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setEditing(true);
        }
      } : undefined}
    >
      {value || (field === "content" && editable ? "Add body text…" : value)}
    </span>
  );
}

function TasksPanel({
  notes,
  editable,
  toggle,
  edit,
  remove,
  editingChanged,
  close,
}: {
  notes: NoteDto[];
  editable: boolean;
  toggle: (note: NoteDto) => void;
  edit: (note: NoteDto, title: string) => Promise<void>;
  remove: (note: NoteDto) => void;
  editingChanged: (noteId: string, active: boolean) => void;
  close: () => void;
}) {
  const items = notes.filter((note) => note.kind === 2);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  return (
    <aside className="side-panel">
      <div className="panel-head">
        <h2>Tasks</h2>
        <IconButton label="Close tasks" onClick={close}>
          <X size={18} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="task-group">
        {items.length ? (
          items.map((item) => (
            <div
              className={`panel-task ${item.isCompleted ? "completed" : ""}`}
              key={item.id}
            >
              <label className="wk-checkbox-target">
                <input
                  type="checkbox"
                  aria-label={`Complete ${item.title}`}
                  checked={item.isCompleted}
                  disabled={!editable}
                  onChange={() => toggle(item)}
                />
              </label>
              <InlineNoteText
                note={item}
                field="title"
                label="Checklist item title"
                editable={editable}
                onSave={(title) => edit(item, title)}
                onEditingChange={(active) =>
                  editingChanged(item.parentNoteId ?? item.id, active)}
              />
              {editable && (
                confirmRemove === item.id ? (
                  <>
                    <button className="task-action" onClick={() => setConfirmRemove(null)}>Cancel</button>
                    <button className="task-action danger" onClick={() => {
                      setConfirmRemove(null);
                      remove(item);
                    }}>Confirm delete</button>
                  </>
                ) : (
                  <button className="task-action" onClick={() => setConfirmRemove(item.id)}>
                    Delete
                  </button>
                )
              )}
            </div>
          ))
        ) : (
          <p>No checklist items yet.</p>
        )}
      </div>
      <div className="panel-footer">
        {items.filter((item) => item.isCompleted).length} / {items.length}{" "}
        complete
      </div>
    </aside>
  );
}

function SharePanel({
  board,
  members,
  presence,
  presenceAvailable,
  setGuest,
  changePermission,
  removeGuest,
  close,
}: {
  board: BoardDetailDto;
  members: MemberDto[];
  presence: BoardPresenceSnapshot | null;
  presenceAvailable: boolean;
  setGuest: (email: string, edit: boolean) => Promise<void>;
  changePermission: (member: MemberDto, canEdit: boolean) => Promise<void>;
  removeGuest: (id: string) => Promise<void>;
  close: () => void;
}) {
  const [email, setEmail] = useState(""),
    [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [menu, setMenu] = useState<{ member: MemberDto; anchor: MemberMenuAnchor } | null>(null),
    [removeTarget, setRemoveTarget] = useState<MemberDto | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const removalOrigin = useRef<HTMLElement | null>(null);
  const online = new Set(presenceAvailable ? presence?.viewers.map((viewer) => viewer.userId) : []);
  function closeMenu(restoreFocus = true) {
    const trigger = menu?.anchor.trigger;
    setMenu(null);
    if (restoreFocus && trigger?.isConnected) queueMicrotask(() => trigger.focus());
  }
  function openMenu(member: MemberDto, anchor: MemberMenuAnchor) {
    if (board.role !== 1 || member.role !== 0) return;
    setMenu({ member, anchor });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await setGuest(email.trim(), edit);
      setEmail("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!removeTarget) return;
    setBusy(true);
    setError("");
    try {
      await removeGuest(removeTarget.userId);
      setRemoveTarget(null);
      queueMicrotask(() => heading.current?.focus());
    } catch (cause) {
      setError(memberActionError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="side-panel">
      <div className="panel-head">
        <h2 ref={heading} tabIndex={-1}>Board members</h2>
        <IconButton label="Close sharing" onClick={close}>
          <X size={18} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="member-list">
        {members.map((member) => {
          const name = identityLabel(member);
          const manageable = board.role === 1 && member.role === 0;
          return (
            <div className="member-row" key={member.userId} role="group"
              aria-label={`${name}, ${member.role === 1 ? "Owner" : member.canEdit ? "Editor" : "Viewer"}`}
              tabIndex={manageable ? 0 : undefined}
              aria-keyshortcuts={manageable ? "Shift+F10" : undefined}
              onContextMenu={(event) => {
                if (!manageable) return;
                event.preventDefault();
                openMenu(member, { x: event.clientX, y: event.clientY, trigger: event.currentTarget });
              }}
              onKeyDown={(event) => {
                if (!manageable || !(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey)) return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                openMenu(member, { x: rect.left, y: rect.bottom, trigger: event.currentTarget });
              }}>
              <Avatar identity={member} size="small" className="avatar" style={collaboratorStyle(member.userId)} />
              <div className="wk-member-copy">
                <strong>{name}</strong>
                <span>@{member.username}</span>
                <small>{member.role === 1 ? "Owner" : member.canEdit ? "Editor" : "Viewer"}</small>
                {online.has(member.userId) && <small className="wk-member-online">Online now</small>}
              </div>
              {manageable && (
                <IconButton label={`Actions for ${name}`} className="wk-member-actions"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    openMenu(member, { x: rect.left, y: rect.bottom, trigger: event.currentTarget });
                  }}>
                  <MoreHorizontal size={19} aria-hidden="true" />
                </IconButton>
              )}
            </div>
          );
        })}
      </div>
      {menu && (
        <MemberActionsMenu member={menu.member} anchor={menu.anchor}
          onClose={closeMenu} onPermission={changePermission}
          onRemove={(member) => {
            removalOrigin.current = menu.anchor.trigger;
            closeMenu(false);
            setError("");
            setRemoveTarget(member);
          }} />
      )}
      {removeTarget && (
        <Dialog title={`Remove ${identityLabel(removeTarget)}?`} urgent
          onClose={() => {
            if (busy) return;
            setRemoveTarget(null);
            queueMicrotask(() => removalOrigin.current?.focus());
          }}>
          <p>They will immediately lose access to this board.</p>
          {error && <p className="wk-alert" role="alert">{error}</p>}
          <div className="wk-dialog-actions">
            <Button variant="quiet" disabled={busy} onClick={() => {
              setRemoveTarget(null);
              queueMicrotask(() => removalOrigin.current?.focus());
            }}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => void remove()}>
              {busy ? "Removing…" : "Remove collaborator"}
            </Button>
          </div>
        </Dialog>
      )}
      {board.role === 1 && (
        <form className="share-form" onSubmit={submit}>
          <label>
            Registered guest email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={edit}
              onChange={(e) => setEdit(e.target.checked)}
            />{" "}
            Allow editing
          </label>
          <Button type="submit" disabled={busy || !email.trim()}>
            Add or update guest
          </Button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}

function NoteCard({
  note,
  items,
  selected,
  editable,
  select,
  toggle,
  addItem,
  editTitle,
  editContent,
  editItem,
  removeItem,
  openProperties,
  autoEditTitle,
  preview,
  cancelPreview,
  commitVisual,
  broadcastGeometry,
  endGeometry,
  connectStart,
  connectMove,
  connectEnd,
  connectCancel,
  connecting,
  targetHighlighted,
  remoteGeometry,
  editors,
  editingChanged,
}: {
  note: NoteDto;
  items: NoteDto[];
  selected: boolean;
  editable: boolean;
  select: () => void;
  toggle: (n: NoteDto) => void;
  addItem: (title: string) => void;
  editTitle: (title: string) => Promise<void>;
  editContent: (content: string) => Promise<void>;
  editItem: (item: NoteDto, title: string) => Promise<void>;
  removeItem: (item: NoteDto) => void;
  openProperties: (origin: HTMLElement) => void;
  autoEditTitle: boolean;
  preview: (id: string, patch: VisualPatch) => void;
  cancelPreview: (id: string, patch: VisualPatch) => void;
  commitVisual: (id: string, patch: VisualPatch) => Promise<void>;
  broadcastGeometry: (
    noteId: string,
    baseVersion: number,
    operation: NoteGeometryOperation,
    patch: VisualPatch,
  ) => number;
  endGeometry: (noteId: string, sequence: number) => void;
  connectStart: (id: string, event: Pointer<HTMLButtonElement>) => void;
  connectMove: (event: Pointer<HTMLButtonElement>) => void;
  connectEnd: (event: Pointer<HTMLButtonElement>) => void;
  connectCancel: () => void;
  connecting: boolean;
  targetHighlighted: boolean;
  remoteGeometry?: RemoteGeometryPresentation;
  editors: EditingViewer[];
  editingChanged: (noteId: string, active: boolean) => void;
}) {
  const drag = useRef<{
    px: number; py: number; x: number; y: number; last: VisualPatch;
  } | null>(null);
  const resize = useRef<{
    px: number; py: number; width: number; height: number; last: VisualPatch;
  } | null>(null);
  const suppressClick = useRef(false);
  const keyboardPosition = useRef({
    x: note.positionX ?? 0,
    y: note.positionY ?? 0,
  });
  const networkPreview = useRef<{
    lastSentAt: number;
    lastSequence: number;
    timer: ReturnType<typeof setTimeout> | null;
    pending: { operation: NoteGeometryOperation; patch: VisualPatch } | null;
  }>({ lastSentAt: 0, lastSequence: 0, timer: null, pending: null });
  const [addingItem, setAddingItem] = useState(false);
  const [itemDraft, setItemDraft] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const textDraft = useNoteDraft(note.id);
  const addingDone = useRef(false);
  useEffect(() => {
    keyboardPosition.current = {
      x: note.positionX ?? 0,
      y: note.positionY ?? 0,
    };
  }, [note.positionX, note.positionY]);
  function emitGeometry(operation: NoteGeometryOperation, patch: VisualPatch) {
    networkPreview.current.lastSentAt = performance.now();
    networkPreview.current.lastSequence = broadcastGeometry(
      note.id,
      note.version,
      operation,
      patch,
    );
  }
  function scheduleGeometry(operation: NoteGeometryOperation, patch: VisualPatch) {
    const state = networkPreview.current;
    const remaining = 75 - (performance.now() - state.lastSentAt);
    if (remaining <= 0) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      state.pending = null;
      emitGeometry(operation, patch);
      return;
    }
    state.pending = { operation, patch };
    if (state.timer) return;
    state.timer = setTimeout(() => {
      const pending = networkPreview.current.pending;
      networkPreview.current.timer = null;
      networkPreview.current.pending = null;
      if (pending) emitGeometry(pending.operation, pending.patch);
    }, remaining);
  }
  function flushGeometry(operation: NoteGeometryOperation, patch: VisualPatch) {
    const state = networkPreview.current;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.pending = null;
    emitGeometry(operation, patch);
    return state.lastSequence;
  }
  const cancelGeometry = useCallback(() => {
    const state = networkPreview.current;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.pending = null;
    if (state.lastSequence > 0) endGeometry(note.id, state.lastSequence);
    state.lastSequence = 0;
    state.lastSentAt = 0;
  }, [endGeometry, note.id]);
  function completeGeometry(sequence: number) {
    endGeometry(note.id, sequence);
    if (networkPreview.current.lastSequence !== sequence) return;
    networkPreview.current.lastSequence = 0;
    networkPreview.current.lastSentAt = 0;
  }
  useEffect(() => () => cancelGeometry(), [cancelGeometry]);
  function submitItem() {
    if (addingDone.current) return;
    addingDone.current = true;
    const title = itemDraft.trim();
    setAddingItem(false);
    setItemDraft("");
    if (title) addItem(title);
  }
  function down(e: Pointer<HTMLDivElement>) {
    if (!editable || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("input, textarea, button, select, .editable-text, [contenteditable='true']")) return;
    drag.current = {
      px: e.clientX,
      py: e.clientY,
      x: note.positionX ?? 0,
      y: note.positionY ?? 0,
      last: {},
    };
    suppressClick.current = false;
    cancelGeometry();
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: Pointer<HTMLDivElement>) {
    if (!drag.current) return;
    if (!(e.buttons & 1)) return up(e);
    drag.current.last = {
      positionX: Math.max(0, drag.current.x + e.clientX - drag.current.px),
      positionY: Math.max(0, drag.current.y + e.clientY - drag.current.py),
    };
    preview(note.id, drag.current.last);
    if (isDragGesture(drag.current.px, drag.current.py, e.clientX, e.clientY))
      scheduleGeometry(0, drag.current.last);
  }
  function up(e: Pointer<HTMLDivElement>) {
    if (!drag.current) return;
    const active = drag.current;
    drag.current = null;
    const final = {
      positionX: Math.max(0, active.x + e.clientX - active.px),
      positionY: Math.max(0, active.y + e.clientY - active.py),
    };
    if (isDragGesture(active.px, active.py, e.clientX, e.clientY)) {
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      preview(note.id, final);
      const sequence = flushGeometry(0, final);
      void commitVisual(note.id, final).finally(() => completeGeometry(sequence));
    } else {
      cancelPreview(note.id, active.last);
      cancelGeometry();
    }
  }
  function cancelDrag() {
    if (!drag.current) return;
    cancelPreview(note.id, drag.current.last);
    drag.current = null;
    cancelGeometry();
  }
  function resizeMove(e: Pointer<HTMLButtonElement>) {
    if (!resize.current) return;
    if (!(e.buttons & 1)) return resizeUp(e);
    const nextWidth = resize.current.width + e.clientX - resize.current.px;
    const bounds = noteDimensionBounds(note, items, nextWidth);
    resize.current.last = {
      width: clampDimension(nextWidth, bounds.minWidth, bounds.maxWidth),
      height: clampDimension(resize.current.height + e.clientY - resize.current.py, bounds.minHeight, bounds.maxHeight),
    };
    preview(note.id, resize.current.last);
    scheduleGeometry(1, resize.current.last);
  }
  function resizeUp(e: Pointer<HTMLButtonElement>) {
    if (!resize.current) return;
    const active = resize.current;
    resize.current = null;
    const nextWidth = active.width + e.clientX - active.px;
    const bounds = noteDimensionBounds(note, items, nextWidth);
    const final = {
      width: clampDimension(nextWidth, bounds.minWidth, bounds.maxWidth),
      height: clampDimension(active.height + e.clientY - active.py, bounds.minHeight, bounds.maxHeight),
    };
    if (final.width !== active.width || final.height !== active.height) {
      preview(note.id, final);
      const sequence = flushGeometry(1, final);
      void commitVisual(note.id, final).finally(() => completeGeometry(sequence));
    } else {
      cancelPreview(note.id, active.last);
      cancelGeometry();
    }
  }
  function cancelResize() {
    if (!resize.current) return;
    cancelPreview(note.id, resize.current.last);
    resize.current = null;
    cancelGeometry();
  }
  function keyboardMove(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
      return;
    }
    if (!editable || !event.key.startsWith("Arrow")) return;
    const distance = event.shiftKey ? 32 : 8;
    const delta = {
      ArrowLeft: { x: -distance, y: 0 },
      ArrowRight: { x: distance, y: 0 },
      ArrowUp: { x: 0, y: -distance },
      ArrowDown: { x: 0, y: distance },
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    select();
    keyboardPosition.current = {
      x: Math.max(0, keyboardPosition.current.x + delta.x),
      y: Math.max(0, keyboardPosition.current.y + delta.y),
    };
    const patch = {
      positionX: keyboardPosition.current.x,
      positionY: keyboardPosition.current.y,
    };
    preview(note.id, patch);
    void commitVisual(note.id, patch);
  }
  return (
    <div
      data-note-id={note.id}
      role="group"
      className={`sticky-note ${selected ? "selected" : ""} ${note.kind === 1 ? "task-note" : ""} ${remoteGeometry ? "remote-geometry" : ""}`}
      style={{
        ...noteAppearanceStyle(note.color),
        ...(remoteGeometry ? collaboratorStyle(remoteGeometry.userId) : {}),
        left: 0,
        top: 0,
        transform: `translate3d(${note.positionX ?? 0}px, ${note.positionY ?? 0}px, 0)`,
        width: note.width,
        height: note.height,
        zIndex: `calc(var(--layer-notes) + ${note.zIndex})`,
      }}
      tabIndex={0}
      aria-label={`${note.kind === 1 ? "Task list" : "Note"}: ${note.title}. ${editable ? "Use arrow keys to move; hold Shift for larger steps." : ""}`.trim()}
      aria-keyshortcuts={editable ? "ArrowUp ArrowDown ArrowLeft ArrowRight" : undefined}
      onKeyDown={keyboardMove}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }}
      onFocus={(event) => {
        if (event.target === event.currentTarget) select();
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        select();
      }}
    >
      {remoteGeometry && (
        <div className="remote-geometry-outline" aria-hidden="true">
          <Avatar identity={{ displayName: remoteGeometry.label, username: remoteGeometry.username, profileImageUrl: remoteGeometry.profileImageUrl }} size="small" style={collaboratorStyle(remoteGeometry.userId)} />
          <small>{remoteGeometry.label} is {remoteGeometry.operation === 0 ? "moving" : "resizing"}</small>
        </div>
      )}
      <NoteEditingIndicator editors={editors} />
      <div
        className={`note-head ${editable ? "drag-handle" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancelDrag}
      >
        {editable && (
          <span className="note-drag-grip" title="Drag note" aria-hidden="true">
            <GripVertical size={15} />
          </span>
        )}
        <span className="note-type">
          {note.kind === 1 ? (
            <ListChecks size={13} />
          ) : (
            <StickyNote size={13} />
          )}
        </span>
        <strong>
          <InlineNoteText
            note={note}
            field="title"
            label={note.kind === 1 ? "Task title" : "Note title"}
            editable={editable}
            autoEdit={autoEditTitle}
            activation="click"
            onSave={editTitle}
            onEditingChange={(active) => editingChanged(note.id, active)}
          />
        </strong>
        <IconButton
          label={`Open properties for ${note.title}`}
          className="note-properties"
          onClick={(event) => {
            event.stopPropagation();
            openProperties(event.currentTarget);
          }}
        >
          <Settings2 size={16} aria-hidden="true" />
        </IconButton>
      </div>
      {note.kind === 1 ? (
        <div className="checklist">
          {items.map((item) => (
            <div key={item.id} className={`checklist-row ${item.isCompleted ? "checked" : ""}`}>
              <label className="wk-checkbox-target" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Complete ${item.title}`}
                  checked={item.isCompleted}
                  disabled={!editable}
                  onChange={() => toggle(item)}
                />
              </label>
              <InlineNoteText
                note={item}
                field="title"
                label="Checklist item title"
                editable={editable}
                onSave={(title) => editItem(item, title)}
                onEditingChange={(active) => editingChanged(note.id, active)}
              />
              {editable && (confirmRemove === item.id ? (
                <span className="checklist-confirm">
                  <button className="task-action" onClick={(e) => {
                    e.stopPropagation();
                    setConfirmRemove(null);
                  }}>Cancel</button>
                  <button className="task-action danger" onClick={(e) => {
                    e.stopPropagation();
                    setConfirmRemove(null);
                    removeItem(item);
                  }}>Confirm delete</button>
                </span>
              ) : (
                <button className="task-action" aria-label={`Delete ${item.title}`} onClick={(e) => {
                  e.stopPropagation();
                  setConfirmRemove(item.id);
                }}><X size={16} aria-hidden="true" /></button>
              ))}
            </div>
          ))}
          {editable && (
            addingItem ? (
              <input
                className="inline-edit new-item-input"
                aria-label="New checklist item"
                placeholder="Type checklist item…"
                autoFocus
                maxLength={200}
                value={itemDraft}
                onChange={(e) => setItemDraft(e.target.value)}
                onFocus={() => editingChanged(note.id, true)}
                onBlur={() => {
                  editingChanged(note.id, false);
                  submitItem();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    addingDone.current = true;
                    editingChanged(note.id, false);
                    setAddingItem(false);
                    setItemDraft("");
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button
                className="add-task"
                onClick={(e) => {
                  e.stopPropagation();
                  addingDone.current = false;
                  setAddingItem(true);
                }}
              >
                <Plus size={13} /> Add item
              </button>
            )
          )}
          <div className="progress-line">
            <span
              style={{
                width: `${items.length ? (items.filter((item) => item.isCompleted).length / items.length) * 100 : 0}%`,
              }}
            />
          </div>
          <small>
            {items.filter((item) => item.isCompleted).length} / {items.length}{" "}
            complete
          </small>
        </div>
      ) : (
        <div className="note-body">
          <InlineNoteText
            note={note}
            field="content"
            label="Note body"
            editable={editable}
            activation="click"
            onSave={editContent}
            onEditingChange={(active) => editingChanged(note.id, active)}
          />
        </div>
      )}
      {textDraft && (
        <span className={`note-draft-state ${textDraft.recovery === "stale" ? "is-stale" : ""}`}>
          {textDraft.recovery === "stale" ? "Draft needs review" : "Unsaved draft"}
        </span>
      )}
      {editable && (
        <>
          <button
            className="connection-handle connection-source"
            type="button"
            aria-label={`Connect from ${note.title}`}
            title="Drag to another note"
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              connectStart(note.id, event);
            }}
            onPointerMove={connectMove}
            onPointerUp={connectEnd}
            onPointerCancel={connectCancel}
            onClick={(event) => event.stopPropagation()}
          />
          <button
            className="resize-handle"
            type="button"
            aria-label={`Resize ${note.title}`}
            title="Drag to resize"
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.button !== 0) return;
              resize.current = {
                px: event.clientX,
                py: event.clientY,
                width: note.width,
                height: note.height,
                last: {},
              };
              cancelGeometry();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={resizeMove}
            onPointerUp={resizeUp}
            onPointerCancel={cancelResize}
            onClick={(event) => event.stopPropagation()}
          />
        </>
      )}
      <span className={`connection-handle connection-target ${connecting || targetHighlighted ? "visible" : ""} ${targetHighlighted ? "highlighted" : ""}`} aria-hidden="true" />
    </div>
  );
}

function PropertiesEditor({
  note,
  items,
  children,
  visualColor,
  visualWidth,
  visualHeight,
  editable,
  removeNote,
  deleted,
  preview,
  cancelPreview,
  commitVisual,
  changeColor,
  failed,
  notify,
}: {
  note: NoteDto;
  items: NoteDto[];
  children: React.ReactNode;
  visualColor: string;
  visualWidth: number;
  visualHeight: number;
  editable: boolean;
  removeNote: (id: string) => Promise<void>;
  deleted: (id: string) => void;
  preview: (id: string, patch: VisualPatch) => void;
  cancelPreview: (id: string, patch: VisualPatch) => void;
  commitVisual: (id: string, patch: VisualPatch) => Promise<void>;
  changeColor: (id: string, color: string) => void;
  failed: (id: string, cause: unknown) => void;
  notify: (m: string) => void;
}) {
  const textDraft = useNoteDraft(note.id);
  const sourceBounds = noteDimensionBounds(note, items);
  const displayedWidth = clampDimension(note.width, sourceBounds.minWidth, sourceBounds.maxWidth);
  const displayedBounds = noteDimensionBounds(note, items, displayedWidth);
  const displayedHeight = clampDimension(note.height, displayedBounds.minHeight, displayedBounds.maxHeight);
  const [width, setWidth] = useState(String(displayedWidth)),
    [height, setHeight] = useState(String(displayedHeight)),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const candidateWidth = Number(width);
  const bounds = noteDimensionBounds(note, items, Number.isFinite(candidateWidth) && width ? candidateWidth : displayedWidth);
  useEffect(() => {
    setWidth(String(displayedWidth));
    setHeight(String(displayedHeight));
  }, [displayedWidth, displayedHeight]);
  async function remove() {
    setBusy(true);
    try {
      await removeNote(note.id);
      deleted(note.id);
      notify(note.kind === 1 ? "Task list deleted" : "Note deleted");
    } catch (cause) {
      failed(note.id, cause);
    } finally {
      setBusy(false);
    }
  }
  function setDimension(field: "width" | "height", value: string) {
    if (field === "width") setWidth(value);
    else setHeight(value);
    const number = Number(value);
    if (!value || !Number.isFinite(number)) return;
    const nextBounds = field === "width" ? sourceBounds : bounds;
    preview(note.id, { [field]: clampDimension(number,
      field === "width" ? nextBounds.minWidth : nextBounds.minHeight,
      field === "width" ? nextBounds.maxWidth : nextBounds.maxHeight) });
  }
  function finishDimension(field: "width" | "height") {
    const value = field === "width" ? width : height;
    const number = Number(value);
    if (!value || !Number.isFinite(number)) {
      cancelPreview(note.id, { [field]: field === "width" ? visualWidth : visualHeight });
      if (field === "width") setWidth(String(displayedWidth));
      else setHeight(String(displayedHeight));
      return;
    }
    const nextWidth = field === "width"
      ? clampDimension(number, sourceBounds.minWidth, sourceBounds.maxWidth)
      : clampDimension(Number(width) || displayedWidth, sourceBounds.minWidth, sourceBounds.maxWidth);
    const nextBounds = noteDimensionBounds(note, items, nextWidth);
    const nextHeight = field === "height"
      ? clampDimension(number, nextBounds.minHeight, nextBounds.maxHeight)
      : clampDimension(note.height, nextBounds.minHeight, nextBounds.maxHeight);
    const changes: VisualPatch = field === "width" ? { width: nextWidth } : { height: nextHeight };
    if (field === "width") {
      setWidth(String(nextWidth));
      if (nextHeight !== note.height) changes.height = nextHeight;
    } else setHeight(String(nextHeight));
    if (Object.entries(changes).some(([key, next]) => note[key as "width" | "height"] !== next))
      void commitVisual(note.id, changes);
  }
  return (
    <div className="note-editor">
      <div className="note-properties-intro">
        <span className="inspector-object-kind">{note.kind === 1 ? "Task list" : "Note"}</span>
        <p>
          {note.kind === 1
            ? "Edit the title, checklist items, and completion directly on the card."
            : "Edit the title and body directly on the card."}
        </p>
      </div>
      {textDraft && (
        <div className={`draft-recovery ${textDraft.recovery === "stale" ? "is-stale" : ""}`} role={textDraft.recovery === "stale" ? "alert" : "status"}>
          <strong>{textDraft.recovery === "stale" ? "Local draft retained" : "Unsaved text retained"}</strong>
          <p>
            {textDraft.recovery === "stale"
              ? "A newer saved version exists. Your local text remains on the card for review and retry."
              : "This draft is kept for this browser session until it saves successfully."}
          </p>
        </div>
      )}
      {editable && (
        <section className="inspector-section" aria-labelledby={`appearance-${note.id}`}>
          <h3 id={`appearance-${note.id}`}>Appearance</h3>
          <div className="note-edit-fields">
            <fieldset className="note-color-field">
              <legend>Color</legend>
              <div className="note-color-options">
                {notePigments.map((pigment) => (
                  <button
                    key={pigment.value}
                    className="note-color-option"
                    type="button"
                    aria-label={`Use ${pigment.name.toLowerCase()} note color`}
                    aria-pressed={visualColor.slice(0, 7).toUpperCase() === pigment.value}
                    style={{ backgroundColor: pigment.value }}
                    onClick={() => changeColor(note.id, pigment.value)}
                  />
                ))}
              </div>
            </fieldset>
            <div className="dimension-row">
              <label>
                Width
                <input
                  type="number"
                  min={bounds.minWidth}
                  max={bounds.maxWidth}
                  step={8}
                  inputMode="numeric"
                  value={width}
                  onChange={(e) => setDimension("width", e.target.value)}
                  onBlur={() => finishDimension("width")}
                />
              </label>
              <label>
                Height
                <input
                  type="number"
                  min={bounds.minHeight}
                  max={bounds.maxHeight}
                  step={8}
                  inputMode="numeric"
                  value={height}
                  onChange={(e) => setDimension("height", e.target.value)}
                  onBlur={() => finishDimension("height")}
                />
              </label>
            </div>
            <p className="dimension-help">Width {bounds.minWidth}–{bounds.maxWidth}px · Height {bounds.minHeight}–{bounds.maxHeight}px. The minimum adapts to the card's content.</p>
          </div>
        </section>
      )}
      {children}
      <section className="inspector-section inspector-details" aria-labelledby={`details-${note.id}`}>
        <h3 id={`details-${note.id}`}>Details</h3>
        <dl>
          <div><dt>Type</dt><dd>{note.kind === 1 ? "Board task list" : "Board note"}</dd></div>
          <div><dt>Created</dt><dd><time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleDateString()}</time></dd></div>
        </dl>
      </section>
      {editable && (
        <section className="inspector-section inspector-danger" aria-labelledby={`danger-${note.id}`}>
          <h3 id={`danger-${note.id}`}>Danger zone</h3>
          <div className="editor-actions">
            {confirmDelete ? (
              <>
                <Button variant="quiet" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button variant="danger" disabled={busy} onClick={() => void remove()}>Confirm delete</Button>
              </>
            ) : (
              <Button variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function InspectorFrame({
  title,
  presentation,
  close,
  children,
}: {
  title: string;
  presentation: "desktop" | "tablet" | "mobile";
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside
      className={`editor-panel editor-panel--${presentation}`}
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <div className="panel-head">
        <h2>{title}</h2>
        <IconButton label="Close properties" autoFocus onClick={close}>
          <X size={18} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="editor-panel-content">{children}</div>
    </aside>
  );
}

type WorkspaceProps = {
  id: string;
  titleOverride?: string;
  currentUserId: string;
  profileIdentityVersion: string;
  back: () => void;
  boardLoaded: (board: BoardDetailDto) => void;
  notify: (message: string) => void;
};

function Workspace(props: WorkspaceProps) {
  return (
    <EditorStateProvider userId={props.currentUserId} boardId={props.id}>
      <WorkspaceContent {...props} />
    </EditorStateProvider>
  );
}

function WorkspaceContent({
  id,
  titleOverride,
  currentUserId,
  profileIdentityVersion,
  back,
  boardLoaded,
  notify,
}: WorkspaceProps) {
  const editor = useEditorActions();
  const editorNavigation = useEditorNavigation();
  const selected = editorNavigation.selectedNoteId;
  const [board, setBoard] = useState<BoardDetailDto | null>(null),
    [notes, setNotes] = useState<NoteDto[]>([]),
    [edges, setEdges] = useState<ConnectionDto[]>([]),
    [members, setMembers] = useState<MemberDto[]>([]);
  const [loading, setLoading] = useState(true),
    [failure, setFailure] = useState(""),
    [editTitleId, setEditTitleId] = useState<string | null>(null),
    [panel, setPanel] = useState<Panel>(null),
    [connecting, setConnecting] = useState(false),
    [type, setType] = useState<0 | 1>(0),
    [conflicted, setConflicted] = useState<string | null>(null),
    [conflictLatest, setConflictLatest] = useState<NoteDto | null>(null),
    [visuals, setVisuals] = useState<Record<string, VisualPatch>>({}),
    [remotePreviews, setRemotePreviews] = useState<Record<string, NoteGeometryPreviewEvent>>({}),
    [remoteEditing, setRemoteEditing] = useState<NoteEditingByNote>({}),
    [presence, setPresence] = useState<BoardPresenceSnapshot | null>(null),
    [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null),
    [connectionTargetId, setConnectionTargetId] = useState("");
  const realtimeStatus = useSyncExternalStore(
    realtimeConnection.subscribe,
    realtimeConnection.getSnapshot,
  );
  const [cursorStore] = useState(() => new CursorRenderStore());
  useEffect(() => {
    void boardApi.members(id).then(setMembers).catch(() => undefined);
  }, [id, profileIdentityVersion]);
  const notesRef = useRef<NoteDto[]>([]);
  const permissionRef = useRef<boolean | null>(null);
  const noteTombstones = useRef(new Map<string, number>());
  const mutationQueues = useRef(new Map<string, Promise<void>>());
  const blockedNotes = useRef(new Set<string>());
  const colorTimers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; color: string }>());
  const draftRef = useRef<ConnectionDraft | null>(null);
  const geometrySequence = useRef(0);
  const remotePreviewsRef = useRef<Record<string, NoteGeometryPreviewEvent>>({});
  const remotePreviewEnds = useRef(new Map<string, number>());
  const remotePreviewTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const remoteEditingRef = useRef<NoteEditingByNote>({});
  const remoteEditingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const editingSequence = useRef(0);
  const cursorSequence = useRef(0);
  const remoteCursorsRef = useRef<BoardCursorsByConnection>({});
  const remoteCursorEnds = useRef(new Map<string, number>());
  const remoteCursorTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const localCursor = useRef<{
    active: boolean;
    lastSentAt: number;
    pending: { x: number; y: number } | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ active: false, lastSentAt: 0, pending: null, timer: null });
  const localEditing = useRef<{
    noteId: string;
    renewal: ReturnType<typeof setInterval> | null;
    pendingStop: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const publishNotes = useCallback((update: (current: NoteDto[]) => NoteDto[]) => {
    const next = update(notesRef.current);
    notesRef.current = next;
    setNotes(next);
  }, []);
  const clearRemotePreview = useCallback((noteId: string) => {
    const timer = remotePreviewTimers.current.get(noteId);
    if (timer) clearTimeout(timer);
    remotePreviewTimers.current.delete(noteId);
    if (!remotePreviewsRef.current[noteId]) return;
    const next = { ...remotePreviewsRef.current };
    delete next[noteId];
    remotePreviewsRef.current = next;
    setRemotePreviews(next);
  }, []);
  const clearAllRemotePreviews = useCallback(() => {
    for (const timer of remotePreviewTimers.current.values()) clearTimeout(timer);
    remotePreviewTimers.current.clear();
    remotePreviewsRef.current = {};
    setRemotePreviews({});
  }, []);
  const clearAllRemoteEditing = useCallback(() => {
    for (const timer of remoteEditingTimers.current.values()) clearTimeout(timer);
    remoteEditingTimers.current.clear();
    remoteEditingRef.current = {};
    setRemoteEditing({});
  }, []);
  const clearAllRemoteCursors = useCallback(() => {
    for (const timer of remoteCursorTimers.current.values()) clearTimeout(timer);
    remoteCursorTimers.current.clear();
    remoteCursorsRef.current = {};
    remoteCursorEnds.current.clear();
    cursorStore.set({});
  }, [cursorStore]);
  const clearRemoteEditingForNote = useCallback((noteId: string) => {
    const current = remoteEditingRef.current[noteId];
    if (!current) return;
    for (const connectionId of Object.keys(current)) {
      const key = `${noteId}:${connectionId}`;
      const timer = remoteEditingTimers.current.get(key);
      if (timer) clearTimeout(timer);
      remoteEditingTimers.current.delete(key);
    }
    const next = { ...remoteEditingRef.current };
    delete next[noteId];
    remoteEditingRef.current = next;
    setRemoteEditing(next);
  }, []);
  const acceptRemoteEditing = useCallback((incoming: NoteEditingStartedEvent) => {
    const next = applyEditingStarted(remoteEditingRef.current, incoming);
    if (next === remoteEditingRef.current) return;
    remoteEditingRef.current = next;
    setRemoteEditing(next);
    const key = `${incoming.noteId}:${incoming.connectionId}`;
    const previous = remoteEditingTimers.current.get(key);
    if (previous) clearTimeout(previous);
    const parsedExpiry = Date.parse(incoming.expiresAt);
    const remaining = Number.isFinite(parsedExpiry)
      ? Math.min(8_000, Math.max(0, parsedExpiry - Date.now()))
      : 7_000;
    const timer = setTimeout(() => {
      const expired: NoteEditingStoppedEvent = {
        boardId: incoming.boardId,
        noteId: incoming.noteId,
        userId: incoming.userId,
        connectionId: incoming.connectionId,
        sequence: incoming.sequence,
      };
      const expiredState = applyEditingStopped(remoteEditingRef.current, expired);
      if (expiredState !== remoteEditingRef.current) {
        remoteEditingRef.current = expiredState;
        setRemoteEditing(expiredState);
      }
      remoteEditingTimers.current.delete(key);
    }, remaining);
    remoteEditingTimers.current.set(key, timer);
  }, []);
  const endRemoteEditing = useCallback((incoming: NoteEditingStoppedEvent) => {
    const next = applyEditingStopped(remoteEditingRef.current, incoming);
    if (next === remoteEditingRef.current) return;
    remoteEditingRef.current = next;
    setRemoteEditing(next);
    const key = `${incoming.noteId}:${incoming.connectionId}`;
    const timer = remoteEditingTimers.current.get(key);
    if (timer) clearTimeout(timer);
    remoteEditingTimers.current.delete(key);
  }, []);
  const stopLocalEditingNow = useCallback((noteId?: string) => {
    const active = localEditing.current;
    if (!active || (noteId && active.noteId !== noteId)) return;
    if (active.pendingStop) clearTimeout(active.pendingStop);
    if (active.renewal) clearInterval(active.renewal);
    localEditing.current = null;
    const sequence = ++editingSequence.current;
    void realtimeConnection.stopNoteEditing(id, active.noteId, sequence);
  }, [id]);
  const beginEditing = useCallback((noteId: string) => {
    const current = localEditing.current;
    if (current?.noteId === noteId) {
      if (current.pendingStop) clearTimeout(current.pendingStop);
      current.pendingStop = null;
      return;
    }
    if (current) stopLocalEditingNow();
    const sequence = ++editingSequence.current;
    void realtimeConnection.startNoteEditing(id, noteId, sequence);
    const active = {
      noteId,
      renewal: null as ReturnType<typeof setInterval> | null,
      pendingStop: null,
    };
    active.renewal = setInterval(() => {
      if (localEditing.current !== active) return;
      const renewalSequence = ++editingSequence.current;
      void realtimeConnection.startNoteEditing(id, noteId, renewalSequence);
    }, 3_000);
    localEditing.current = active;
  }, [id, stopLocalEditingNow]);
  const finishEditing = useCallback((noteId: string, immediate = false) => {
    const active = localEditing.current;
    if (!active || active.noteId !== noteId) return;
    if (immediate) {
      stopLocalEditingNow(noteId);
      return;
    }
    if (active.pendingStop) return;
    active.pendingStop = setTimeout(() => stopLocalEditingNow(noteId), 0);
  }, [stopLocalEditingNow]);
  const editingChanged = useCallback((noteId: string, active: boolean) => {
    if (active) beginEditing(noteId);
    else finishEditing(noteId);
  }, [beginEditing, finishEditing]);
  const reannounceLocalEditing = useCallback(() => {
    const active = localEditing.current;
    if (!active) return;
    const sequence = ++editingSequence.current;
    void realtimeConnection.startNoteEditing(id, active.noteId, sequence);
  }, [id]);
  const acceptRemoteCursor = useCallback((incoming: BoardCursorMovedEvent) => {
    if (incoming.userId === currentUserId) return;
    if (!shouldAcceptCursorMoved(
      remoteCursorsRef.current[incoming.connectionId],
      incoming,
      remoteCursorEnds.current.get(incoming.connectionId),
    )) return;
    const next = applyCursorMoved(remoteCursorsRef.current, incoming);
    if (next === remoteCursorsRef.current) return;
    remoteCursorsRef.current = next;
    cursorStore.set(next);
    const previous = remoteCursorTimers.current.get(incoming.connectionId);
    if (previous) clearTimeout(previous);
    const parsedExpiry = Date.parse(incoming.expiresAt);
    const remaining = Number.isFinite(parsedExpiry)
      ? Math.min(2_000, Math.max(0, parsedExpiry - Date.now()))
      : 1_500;
    const timer = setTimeout(() => {
      const expired: BoardCursorStoppedEvent = {
        boardId: incoming.boardId,
        userId: incoming.userId,
        connectionId: incoming.connectionId,
        sequence: incoming.sequence,
      };
      const expiredState = applyCursorStopped(remoteCursorsRef.current, expired);
      remoteCursorEnds.current.set(incoming.connectionId, incoming.sequence);
      if (expiredState !== remoteCursorsRef.current) {
        remoteCursorsRef.current = expiredState;
        cursorStore.set(expiredState);
      }
      remoteCursorTimers.current.delete(incoming.connectionId);
    }, remaining);
    remoteCursorTimers.current.set(incoming.connectionId, timer);
  }, [currentUserId, cursorStore]);
  const endRemoteCursor = useCallback((incoming: BoardCursorStoppedEvent) => {
    remoteCursorEnds.current.set(incoming.connectionId, Math.max(
      remoteCursorEnds.current.get(incoming.connectionId) ?? -1,
      incoming.sequence));
    const next = applyCursorStopped(remoteCursorsRef.current, incoming);
    if (next === remoteCursorsRef.current) return;
    remoteCursorsRef.current = next;
    cursorStore.set(next);
    const timer = remoteCursorTimers.current.get(incoming.connectionId);
    if (timer) clearTimeout(timer);
    remoteCursorTimers.current.delete(incoming.connectionId);
  }, [cursorStore]);
  const stopLocalCursor = useCallback(() => {
    const state = localCursor.current;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.pending = null;
    if (!state.active) return;
    state.active = false;
    const sequence = ++cursorSequence.current;
    void realtimeConnection.stopBoardCursor(id, sequence);
  }, [id]);
  const flushLocalCursor = useCallback(() => {
    const state = localCursor.current;
    state.timer = null;
    const position = state.pending;
    if (!position || !state.active) return;
    state.pending = null;
    state.lastSentAt = performance.now();
    const sequence = ++cursorSequence.current;
    void realtimeConnection.moveBoardCursor(id, position.x, position.y, sequence);
  }, [id]);
  const moveLocalCursor = useCallback((event: Pointer<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect || realtimeConnection.getSnapshot() !== "connected") return;
    const state = localCursor.current;
    state.active = true;
    state.pending = clientPointToBoard(
      rect,
      { left: canvas.scrollLeft, top: canvas.scrollTop },
      { x: event.clientX, y: event.clientY },
    );
    const remaining = 75 - (performance.now() - state.lastSentAt);
    if (remaining <= 0 && state.timer === null) {
      flushLocalCursor();
      return;
    }
    if (state.timer === null)
      state.timer = setTimeout(flushLocalCursor, Math.max(0, remaining));
  }, [flushLocalCursor]);
  const acceptRemotePreview = useCallback((incoming: NoteGeometryPreviewEvent) => {
    const note = notesRef.current.find((candidate) => candidate.id === incoming.noteId);
    const senderKey = `${incoming.noteId}:${incoming.connectionId}`;
    if (!note || note.kind === 2 || !shouldAcceptGeometryPreview(
        remotePreviewsRef.current[incoming.noteId],
        incoming,
        note.version,
        remotePreviewEnds.current.get(senderKey))) return;

    const next = { ...remotePreviewsRef.current, [incoming.noteId]: incoming };
    remotePreviewsRef.current = next;
    setRemotePreviews(next);
    const previousTimer = remotePreviewTimers.current.get(incoming.noteId);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      const current = remotePreviewsRef.current[incoming.noteId];
      if (current?.connectionId === incoming.connectionId &&
          current.sequence === incoming.sequence) {
        remotePreviewEnds.current.set(senderKey, incoming.sequence);
        clearRemotePreview(incoming.noteId);
      }
    }, 1_500);
    remotePreviewTimers.current.set(incoming.noteId, timer);
  }, [clearRemotePreview]);
  const endRemotePreview = useCallback((ended: NoteGeometryPreviewEndedEvent) => {
    const senderKey = `${ended.noteId}:${ended.connectionId}`;
    remotePreviewEnds.current.set(senderKey, Math.max(
      remotePreviewEnds.current.get(senderKey) ?? -1,
      ended.sequence));
    if (shouldEndGeometryPreview(remotePreviewsRef.current[ended.noteId], ended))
      clearRemotePreview(ended.noteId);
  }, [clearRemotePreview]);
  const mergeAuthoritativeNote = useCallback((incoming: NoteDto) => {
    editor.reconcileAuthoritative(incoming);
    const current = notesRef.current.find((note) => note.id === incoming.id);
    if (shouldClearGeometryPreview(current?.version, incoming.version))
      clearRemotePreview(incoming.id);
    publishNotes((current) => mergeVersionedNote(
      current,
      incoming,
      noteTombstones.current.get(incoming.id),
    ));
  }, [clearRemotePreview, editor, publishNotes]);
  const mergeConnection = useCallback((incoming: ConnectionDto) => {
    setEdges((current) => current.some((edge) => edge.id === incoming.id)
      ? current
      : [...current, incoming]);
  }, []);
  const preview = useCallback((noteId: string, patch: VisualPatch) => {
    setVisuals((current) => ({
      ...current,
      [noteId]: { ...current[noteId], ...patch },
    }));
  }, []);
  const broadcastGeometry = useCallback((
    noteId: string,
    baseVersion: number,
    operation: NoteGeometryOperation,
    patch: VisualPatch,
  ) => {
    const sequence = ++geometrySequence.current;
    void realtimeConnection.sendNoteGeometryPreview({
      boardId: id,
      noteId,
      operation,
      x: operation === 0 ? patch.positionX ?? null : null,
      y: operation === 0 ? patch.positionY ?? null : null,
      width: operation === 1 ? patch.width ?? null : null,
      height: operation === 1 ? patch.height ?? null : null,
      baseVersion,
      sequence,
    });
    return sequence;
  }, [id]);
  const endGeometry = useCallback((noteId: string, sequence: number) => {
    void realtimeConnection.endNoteGeometryPreview(id, noteId, sequence);
  }, [id]);
  const cancelPreview = useCallback((noteId: string, patch: VisualPatch) => {
    setVisuals((current) => {
      if (!current[noteId]) return current;
      const next = { ...current[noteId] };
      for (const key of Object.keys(patch) as (keyof VisualPatch)[]) {
        if (next[key] === patch[key]) delete next[key];
      }
      const all = { ...current };
      if (Object.keys(next).length) all[noteId] = next;
      else delete all[noteId];
      return all;
    });
  }, []);
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
        if (isConflict(cause)) blockedNotes.current.add(noteId);
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
  }, []);
  const patchNote = useCallback((noteId: string, changes: PatchNote) =>
    enqueueNote(noteId, async (current) => {
      const updated = await noteApi.patch(id, noteId, current.version, changes);
      publishNotes((all) => all.map((note) => note.id === noteId ? updated : note));
      editor.reconcileSaved(updated);
      return updated;
    }), [editor, enqueueNote, id, publishNotes]);
  const deleteNote = useCallback((noteId: string) =>
    enqueueNote(noteId, async (current) => {
      await noteApi.remove(id, noteId, current.version);
      publishNotes((all) => all.filter((note) => note.id !== noteId));
      setEdges((all) => all.filter((edge) =>
        edge.sourceNoteId !== noteId && edge.targetNoteId !== noteId));
      setVisuals((all) => {
        const next = { ...all };
        delete next[noteId];
        return next;
      });
      editor.removeNote(noteId);
    }), [editor, enqueueNote, id, publishNotes]);
  const failed = useCallback((noteId: string, cause: unknown) => {
    if (isConflict(cause)) {
      editor.markConflict(noteId);
      setConflictLatest(null);
      setConflicted(noteId);
    }
    notify(errorMessage(cause));
  }, [editor, notify]);
  const commitVisual = useCallback(async (noteId: string, changes: VisualPatch) => {
    try {
      await patchNote(noteId, changes);
    } catch (cause) {
      failed(noteId, cause);
    } finally {
      cancelPreview(noteId, changes);
    }
  }, [patchNote, failed, cancelPreview]);
  function changeColor(noteId: string, color: string) {
    preview(noteId, { color });
    const pending = colorTimers.current.get(noteId);
    if (pending) clearTimeout(pending.timer);
    const timer = setTimeout(() => {
      colorTimers.current.delete(noteId);
      void commitVisual(noteId, { color });
    }, 250);
    colorTimers.current.set(noteId, { timer, color });
  }
  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setFailure("");
    try {
      const [b, n, e, m] = await Promise.all([
        boardApi.get(id),
        noteApi.list(id),
        connectionApi.list(id),
        boardApi.members(id),
      ]);
      setBoard(b);
      permissionRef.current = b.canEdit;
      notesRef.current = n;
      setNotes(n);
      editor.hydrate(n);
      setEdges(e);
      setMembers(m);
      if (showLoading) setVisuals({});
      clearAllRemotePreviews();
      clearAllRemoteEditing();
      clearAllRemoteCursors();
      remotePreviewEnds.current.clear();
      noteTombstones.current.clear();
      blockedNotes.current.clear();
      boardLoaded(b);
    } catch (cause) {
      if (cause instanceof AuthApiError && cause.status === 404) {
        editor.clearBoard();
        if (!showLoading) {
          notify("Your access to this board is no longer available.");
          back();
          return;
        }
      }
      setFailure(errorMessage(cause));
      throw cause;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [back, id, boardLoaded, clearAllRemoteCursors, clearAllRemoteEditing, clearAllRemotePreviews, editor, notify]);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);
  useEffect(() => realtimeConnection.onReconnected(() => load(false)), [load]);
  useEffect(() => realtimeConnection.onPresence((incoming) => {
    if (incoming.boardId !== id) return;
    setPresence((current) => mergePresenceSnapshot(current, incoming));
  }), [id]);
  useEffect(() => realtimeConnection.subscribe(() => {
    if (realtimeConnection.getSnapshot() !== "connected") {
      setPresence(null);
      clearAllRemoteEditing();
      clearAllRemoteCursors();
      stopLocalCursor();
      return;
    }
    reannounceLocalEditing();
  }), [clearAllRemoteCursors, clearAllRemoteEditing, reannounceLocalEditing, stopLocalCursor]);
  useEffect(() => {
    const cleanups = [
      realtimeConnection.on<NoteChangedEvent>(realtimeEvents.noteCreated, (message) => {
        if (message.boardId === id) mergeAuthoritativeNote(message);
      }),
      realtimeConnection.on<NoteChangedEvent>(realtimeEvents.noteUpdated, (message) => {
        if (message.boardId === id) mergeAuthoritativeNote(message);
      }),
      realtimeConnection.on<NoteDeletedEvent>(realtimeEvents.noteDeleted, (message) => {
        if (message.boardId !== id) return;
        clearRemotePreview(message.noteId);
        clearRemoteEditingForNote(message.noteId);
        const previous = noteTombstones.current.get(message.noteId) ?? -1;
        noteTombstones.current.set(message.noteId, Math.max(previous, message.version));
        publishNotes((current) => removeVersionedNote(
          current, message.noteId, message.version));
        setEdges((current) => current.filter((edge) =>
          edge.sourceNoteId !== message.noteId && edge.targetNoteId !== message.noteId));
        setVisuals((current) => {
          if (!current[message.noteId]) return current;
          const next = { ...current };
          delete next[message.noteId];
          return next;
        });
        editor.removeNote(message.noteId);
      }),
      realtimeConnection.on<ConnectionCreatedEvent>(
        realtimeEvents.connectionCreated,
        (message) => {
          if (message.boardId === id) mergeConnection(message);
        },
      ),
      realtimeConnection.on<ConnectionDeletedEvent>(
        realtimeEvents.connectionDeleted,
        (message) => {
          if (message.boardId === id)
            setEdges((current) => current.filter((edge) => edge.id !== message.connectionId));
        },
      ),
      realtimeConnection.on<BoardUpdatedEvent>(realtimeEvents.boardUpdated, (message) => {
        if (message.boardId !== id) return;
        setBoard((current) => current &&
          Date.parse(current.updatedAt) > Date.parse(message.updatedAt)
          ? current
          : current && { ...current, title: message.title, updatedAt: message.updatedAt });
      }),
      realtimeConnection.on<BoardScopedEvent>(realtimeEvents.membersChanged, (message) => {
        if (message.boardId !== id) return;
        void Promise.all([boardApi.get(id), boardApi.members(id)]).then(([currentBoard, currentMembers]) => {
          const downgraded = permissionRef.current === true && !currentBoard.canEdit;
          permissionRef.current = currentBoard.canEdit;
          setBoard(currentBoard);
          setMembers(currentMembers);
          boardLoaded(currentBoard);
          if (downgraded) {
            stopLocalEditingNow();
            editor.stopEditing();
            setVisuals({});
            notify("Your permission changed to Viewer. Unsaved text is retained in this browser session.");
          }
        }).catch(() => undefined);
      }),
      realtimeConnection.on<ProfileChangedEvent>(realtimeEvents.profileChanged, (message) => {
        if (message.boardId === id)
          void boardApi.members(id).then(setMembers).catch(() => undefined);
      }),
      realtimeConnection.on<NoteGeometryPreviewEvent>(
        realtimeEvents.noteGeometryPreview,
        (message) => {
          if (message.boardId === id) acceptRemotePreview(message);
        },
      ),
      realtimeConnection.on<NoteGeometryPreviewEndedEvent>(
        realtimeEvents.noteGeometryPreviewEnded,
        (message) => {
          if (message.boardId === id) endRemotePreview(message);
        },
      ),
      realtimeConnection.on<NoteEditingStartedEvent>(
        realtimeEvents.noteEditingStarted,
        (message) => {
          if (message.boardId === id) acceptRemoteEditing(message);
        },
      ),
      realtimeConnection.on<NoteEditingStoppedEvent>(
        realtimeEvents.noteEditingStopped,
        (message) => {
          if (message.boardId === id) endRemoteEditing(message);
        },
      ),
      realtimeConnection.on<BoardCursorMovedEvent>(
        realtimeEvents.boardCursorMoved,
        (message) => {
          if (message.boardId === id) acceptRemoteCursor(message);
        },
      ),
      realtimeConnection.on<BoardCursorStoppedEvent>(
        realtimeEvents.boardCursorStopped,
        (message) => {
          if (message.boardId === id) endRemoteCursor(message);
        },
      ),
      realtimeConnection.on<BoardScopedEvent>(realtimeEvents.boardAccessRevoked, (message) => {
        if (message.boardId !== id) return;
        clearAllRemotePreviews();
        clearAllRemoteEditing();
        clearAllRemoteCursors();
        stopLocalEditingNow();
        stopLocalCursor();
        editor.clearBoard();
        setPresence(null);
        notify("Your access to this board was removed.");
        back();
      }),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [
    acceptRemoteEditing,
    acceptRemoteCursor,
    acceptRemotePreview,
    back,
    clearAllRemoteEditing,
    clearAllRemoteCursors,
    clearAllRemotePreviews,
    clearRemoteEditingForNote,
    clearRemotePreview,
    endRemoteEditing,
    endRemoteCursor,
    endRemotePreview,
    editor,
    id,
    mergeAuthoritativeNote,
    mergeConnection,
    notify,
    publishNotes,
    stopLocalEditingNow,
    stopLocalCursor,
  ]);
  useEffect(() => () => {
    for (const timer of remotePreviewTimers.current.values()) clearTimeout(timer);
    remotePreviewTimers.current.clear();
    remotePreviewsRef.current = {};
    remotePreviewEnds.current.clear();
    for (const timer of remoteEditingTimers.current.values()) clearTimeout(timer);
    remoteEditingTimers.current.clear();
    remoteEditingRef.current = {};
    for (const timer of remoteCursorTimers.current.values()) clearTimeout(timer);
    remoteCursorTimers.current.clear();
    remoteCursorsRef.current = {};
    remoteCursorEnds.current.clear();
    stopLocalEditingNow();
    stopLocalCursor();
    for (const [noteId, pending] of colorTimers.current) {
      clearTimeout(pending.timer);
      void commitVisual(noteId, { color: pending.color });
    }
    colorTimers.current.clear();
  }, [commitVisual, stopLocalCursor, stopLocalEditingNow]);
  async function create(kind: 0 | 1) {
    try {
      setConnecting(false);
      draftRef.current = null;
      setConnectionDraft(null);
      const count = notes.filter((note) => note.kind !== 2).length;
      const value = await noteApi.create(id, {
        kind,
        title: kind === 1 ? "New task list" : "New note",
        content: "",
        positionX: 120 + (count % 2) * 300,
        positionY: 120 + Math.floor(count / 2) * 210,
        color: kind === 1 ? "#EEE2BF" : "#EEE8DB",
      });
      mergeAuthoritativeNote(value);
      editor.select(value.id);
      setEditTitleId(value.id);
      notify(kind === 1 ? "Task list created" : "Note created");
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  async function addItem(parentId: string, title: string) {
    try {
      const value = await noteApi.create(id, {
        kind: 2,
        title: title.trim(),
        parentNoteId: parentId,
      });
      mergeAuthoritativeNote(value);
      notify("Checklist item added");
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  async function toggle(item: NoteDto) {
    try {
      await enqueueNote(item.id, async (current) => {
        const updated = await noteApi.patch(id, item.id, current.version, {
          isCompleted: !current.isCompleted,
        });
        publishNotes((all) => all.map((note) => note.id === item.id ? updated : note));
      });
    } catch (cause) {
      failed(item.id, cause);
    }
  }
  async function editTitle(noteId: string, title: string) {
    try {
      await patchNote(noteId, { title });
      setEditTitleId(null);
    } catch (cause) {
      failed(noteId, cause);
    }
  }
  async function editContent(noteId: string, content: string) {
    try {
      await patchNote(noteId, { content });
      notify("Note body updated");
    } catch (cause) {
      failed(noteId, cause);
    }
  }
  async function editItem(item: NoteDto, title: string) {
    try {
      await patchNote(item.id, { title });
      notify("Checklist item updated");
    } catch (cause) {
      failed(item.id, cause);
    }
  }
  async function removeItem(item: NoteDto) {
    try {
      await deleteNote(item.id);
      notify("Checklist item deleted");
    } catch (cause) {
      failed(item.id, cause);
    }
  }
  function targetAt(clientX: number, clientY: number, sourceId: string): string | null {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const targetId = element?.closest<HTMLElement>("[data-note-id]")?.dataset.noteId ?? null;
    return targetId !== sourceId ? targetId : null;
  }
  function connectStart(sourceId: string, event: Pointer<HTMLButtonElement>) {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect) return;
    event.preventDefault();
    const point = clientPointToBoard(
      rect,
      { left: canvas.scrollLeft, top: canvas.scrollTop },
      { x: event.clientX, y: event.clientY },
    );
    const value = {
      sourceId,
      ...point,
      targetId: null,
    };
    draftRef.current = value;
    setConnectionDraft(value);
    setConnecting(true);
  }
  function connectMove(event: Pointer<HTMLButtonElement>) {
    const current = draftRef.current;
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!current || !canvas || !rect) return;
    if (!(event.buttons & 1)) return connectEnd(event);
    const point = clientPointToBoard(
      rect,
      { left: canvas.scrollLeft, top: canvas.scrollTop },
      { x: event.clientX, y: event.clientY },
    );
    const value = {
      ...current,
      ...point,
      targetId: targetAt(event.clientX, event.clientY, current.sourceId),
    };
    draftRef.current = value;
    setConnectionDraft(value);
  }
  function connectCancel() {
    draftRef.current = null;
    setConnectionDraft(null);
    setConnecting(false);
  }
  async function createConnection(sourceId: string, targetId: string) {
    if (sourceId === targetId || notesAreConnected(sourceId, targetId, edges)) {
      notify("These notes are already connected.");
      return;
    }
    try {
      const edge = await connectionApi.create(id, sourceId, targetId, type);
      mergeConnection(edge);
      setConnectionTargetId("");
      notify("Connection created");
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  async function connectEnd(event: Pointer<HTMLButtonElement>) {
    const current = draftRef.current;
    connectCancel();
    if (!current) return;
    const targetId = targetAt(event.clientX, event.clientY, current.sourceId);
    if (!targetId) return;
    await createConnection(current.sourceId, targetId);
  }
  async function removeEdge(edgeId: string) {
    try {
      await connectionApi.remove(id, edgeId);
      setEdges((previous) => previous.filter((edge) => edge.id !== edgeId));
      notify("Connection removed");
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  async function setGuest(email: string, edit: boolean) {
    await boardApi.setGuest(id, email, edit);
    setMembers(await boardApi.members(id));
    notify("Member access updated");
  }
  async function changePermission(member: MemberDto, canEdit: boolean) {
    await boardApi.setMemberPermission(id, member.userId, canEdit);
    setMembers(await boardApi.members(id));
    notify(`${identityLabel(member)} is now a ${canEdit ? "Editor" : "Viewer"}.`);
  }
  async function removeGuest(guestId: string) {
    const member = members.find((candidate) => candidate.userId === guestId);
    await boardApi.removeGuest(id, guestId);
    setMembers(await boardApi.members(id));
    notify(member ? `${identityLabel(member)} no longer has access to this board.` : "Collaborator removed.");
  }
  async function latest() {
    if (!conflicted) return;
    try {
      const fresh = await noteApi.get(id, conflicted);
      editor.reconcileAuthoritative(fresh);
      publishNotes((all) => all.map((note) => note.id === fresh.id ? fresh : note));
      blockedNotes.current.delete(conflicted);
      setVisuals((all) => {
        const next = { ...all };
        delete next[conflicted];
        return next;
      });
      setConflictLatest(fresh);
    } catch (cause) {
      notify(errorMessage(cause));
    }
  }
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );
  const conflictDraft = useNoteDraft(conflicted ?? "");
  const editorsForNote = (noteId: string): EditingViewer[] =>
    editingUserIds(remoteEditing[noteId], currentUserId).map((userId) => {
      const member = memberById.get(userId);
      return {
        userId,
        label: member ? identityLabel(member) : "Someone",
        initials: member
          ? collaboratorInitials(identityLabel(member))
          : userId.replaceAll("-", "").slice(0, 2).toUpperCase(),
        identity: member,
      };
    });
  const top = notes.filter((note) => note.kind !== 2),
    visualTop = top.map((note) => {
      const remote = remotePreviews[note.id];
      const remoteGeometry: VisualPatch | undefined = remote?.operation === 0
        ? { positionX: remote.x ?? note.positionX ?? 0, positionY: remote.y ?? note.positionY ?? 0 }
        : remote?.operation === 1
          ? { width: remote.width ?? note.width, height: remote.height ?? note.height }
          : undefined;
      const candidate = { ...note, ...remoteGeometry, ...visuals[note.id] };
      const bounds = noteDimensionBounds(candidate, notes.filter((item) => item.parentNoteId === note.id), candidate.width);
      return {
        ...candidate,
        width: clampDimension(candidate.width, bounds.minWidth, bounds.maxWidth),
        height: clampDimension(candidate.height, bounds.minHeight, bounds.maxHeight),
      };
    }),
    inspectorNote = top.find((note) => note.id === editorNavigation.inspectorNoteId),
    editable = board?.canEdit ?? false;
  const inspectorConnections = useMemo(
    () => inspectorNote ? connectedNoteIds(inspectorNote.id, edges) : new Set<string>(),
    [edges, inspectorNote],
  );
  const eligibleConnectionTargets = inspectorNote
    ? top.filter((candidate) =>
        candidate.id !== inspectorNote.id && !inspectorConnections.has(candidate.id))
    : [];
  const activeConnectionTargetId = eligibleConnectionTargets.some(
    (note) => note.id === connectionTargetId,
  ) ? connectionTargetId : "";
  useEffect(() => {
    setConnectionTargetId("");
  }, [editorNavigation.inspectorNoteId]);
  useEffect(() => {
    const noteId = editorNavigation.inspectorNoteId;
    const canvas = canvasRef.current;
    if (!noteId || !canvas) return;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const node = Array.from(canvas.querySelectorAll<HTMLElement>("[data-note-id]"))
          .find((candidate) => candidate.dataset.noteId === noteId);
        if (node) revealBoardNode(canvas, node);
      });
    };
    reveal();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reveal);
    observer?.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [editorNavigation.inspectorNoteId]);
  return (
    <div className="workspace">
      <CollaborationAnnouncements
        editing={remoteEditing}
        members={members}
        notes={notes}
        currentUserId={currentUserId}
        realtimeStatus={realtimeStatus}
      />
      <header className="board-header">
        <div className="board-heading">
          <Button variant="quiet" className="back-button" onClick={back}>
            <ArrowLeft size={18} aria-hidden="true" /> Boards
          </Button>
          <span className="divider" />
          <span className="board-symbol">
            <Sparkles size={14} />
          </span>
          <h1>{titleOverride ?? board?.title ?? "Board"}</h1>
        </div>
        <div className="board-actions">
          <RealtimeHealth status={realtimeStatus} />
          <BoardPresence
            snapshot={presence}
            members={members}
            available={realtimeStatus === "connected"}
          />
          {board && (
            <span className="permission-label">
              {board.role === 1 ? "Owner" : editable ? "Editor" : "Viewer"}
            </span>
          )}
          <Button
            variant="secondary"
            disabled={!board}
            onClick={() => {
              const next = panel === "share" ? null : "share";
              if (next) editor.closeInspector(false);
              setPanel(next);
            }}
          >
            <Share2 size={18} aria-hidden="true" /> Share
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const next = panel === "chat" ? null : "chat";
              if (next) editor.closeInspector(false);
              setPanel(next);
            }}
          >
            <MessageSquare size={18} aria-hidden="true" /> Chat
          </Button>
        </div>
      </header>
      {loading ? (
        <div className="workspace-state">Loading board…</div>
      ) : failure ? (
        <div className="workspace-state">
          <h2>Board unavailable</h2>
          <p>{failure}</p>
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : (
        <main className="board-main">
          <div className="canvas-tools">
            {editable && (
              <>
                <IconButton
                  label="New note"
                  onClick={() => void create(0)}
                >
                  <StickyNote size={18} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label="New task list"
                  onClick={() => void create(1)}
                >
                  <ListChecks size={18} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={connecting ? "Cancel connection mode" : "Connect notes"}
                  className={connecting ? "active" : ""}
                  aria-pressed={connecting}
                  onClick={() => {
                    if (connecting) connectCancel();
                    else setConnecting(true);
                  }}
                >
                  <Link2 size={18} aria-hidden="true" />
                </IconButton>
              </>
            )}
            <span className="tool-rule" />
            <IconButton
              label="Tasks"
              aria-pressed={panel === "tasks"}
              onClick={() => {
                const next = panel === "tasks" ? null : "tasks";
                if (next) editor.closeInspector(false);
                setPanel(next);
              }}
            >
              <ListChecks size={18} aria-hidden="true" />
            </IconButton>
          </div>
          <div
            className="canvas"
            ref={canvasRef}
            tabIndex={-1}
            onPointerMove={moveLocalCursor}
            onPointerLeave={stopLocalCursor}
          >
            <RemoteCursors store={cursorStore} members={members} />
            {connecting && (
              <div className="canvas-label">
                Drag from a note’s right handle to another note{" "}
                <select
                  value={type}
                  onChange={(e) => setType(Number(e.target.value) as 0 | 1)}
                >
                  <option value={0}>Related</option>
                  <option value={1}>Prerequisite</option>
                </select>
              </div>
            )}
            <svg className="connections">
              <defs>
                <marker id="connection-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const a = visualTop.find((n) => n.id === edge.sourceNoteId),
                  b = visualTop.find((n) => n.id === edge.targetNoteId);
                return a && b ? (
                  <path
                    key={edge.id}
                    d={nearestConnectionPath(a, b)}
                    className={edge.type === 1 ? "prerequisite-edge" : "related-edge"}
                    markerEnd="url(#connection-arrow)"
                  />
                ) : null;
              })}
              {connectionDraft && (() => {
                const sourceNote = visualTop.find((note) => note.id === connectionDraft.sourceId);
                if (!sourceNote) return null;
                const startX = (sourceNote.positionX ?? 0) + sourceNote.width;
                const startY = (sourceNote.positionY ?? 0) + sourceNote.height / 2;
                const bend = Math.max(45, Math.abs(connectionDraft.x - startX) / 2);
                return <path className="draft-edge" d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${connectionDraft.x - bend} ${connectionDraft.y}, ${connectionDraft.x} ${connectionDraft.y}`} markerEnd="url(#connection-arrow)" />;
              })()}
            </svg>
            {visualTop.map((note) => {
              const remote = remotePreviews[note.id];
              const remoteMember = remote ? memberById.get(remote.userId) : undefined;
              const remoteLabel = remoteMember ? identityLabel(remoteMember) : "Someone";
              return (
                <NoteCard
                  key={note.id}
                  note={note}
                  items={notes.filter((item) => item.parentNoteId === note.id)}
                  selected={selected === note.id}
                  editable={editable}
                  select={() => editor.select(note.id)}
                  toggle={toggle}
                  addItem={(title) => void addItem(note.id, title)}
                  editTitle={(title) => editTitle(note.id, title)}
                  editContent={(content) => editContent(note.id, content)}
                  editItem={(item, title) => editItem(item, title)}
                  removeItem={(item) => void removeItem(item)}
                  openProperties={(origin) => {
                    setPanel(null);
                    editor.openInspector(note.id, origin);
                  }}
                  autoEditTitle={editTitleId === note.id}
                  preview={preview}
                  cancelPreview={cancelPreview}
                  commitVisual={commitVisual}
                  broadcastGeometry={broadcastGeometry}
                  endGeometry={endGeometry}
                  connectStart={connectStart}
                  connectMove={connectMove}
                  connectEnd={(event) => void connectEnd(event)}
                  connectCancel={connectCancel}
                  connecting={connecting}
                  targetHighlighted={connectionDraft?.targetId === note.id}
                  remoteGeometry={remote ? {
                    userId: remote.userId,
                    label: remoteLabel,
                    initials: collaboratorInitials(remoteLabel),
                    operation: remote.operation,
                    profileImageUrl: remoteMember?.profileImageUrl,
                    username: remoteMember?.username,
                  } : undefined}
                  editors={editorsForNote(note.id)}
                  editingChanged={editingChanged}
                />
              );
            })}
            {!top.length && (
              <div className="canvas-empty" role="status">
                <h2>{editable ? "Start with a note" : "No notes yet"}</h2>
                <p>{editable
                  ? "Capture an idea here, then add a task list when you're ready."
                  : "This board is waiting for its first idea."}</p>
                {editable && <Button onClick={() => void create(0)}><Plus size={18} aria-hidden="true" /> Add note</Button>}
              </div>
            )}
          </div>
          {inspectorNote && (
            <InspectorFrame
              title={`Properties for ${inspectorNote.title}`}
              presentation={editorNavigation.presentation}
              close={editor.closeInspector}
            >
                <PropertiesEditor
                  key={inspectorNote.id}
                  note={inspectorNote}
                  items={notes.filter((item) => item.parentNoteId === inspectorNote.id)}
                  visualColor={visuals[inspectorNote.id]?.color ?? inspectorNote.color}
                  visualWidth={visualTop.find((note) => note.id === inspectorNote.id)?.width ?? inspectorNote.width}
                  visualHeight={visualTop.find((note) => note.id === inspectorNote.id)?.height ?? inspectorNote.height}
                  editable={editable}
                  removeNote={deleteNote}
                  deleted={() => {
                    finishEditing(inspectorNote.id, true);
                  }}
                  preview={preview}
                  cancelPreview={cancelPreview}
                  commitVisual={commitVisual}
                  changeColor={changeColor}
                  failed={failed}
                  notify={notify}
                >
                  <section className="connection-list inspector-section" aria-labelledby={`connections-${inspectorNote.id}`}>
                    <h3 id={`connections-${inspectorNote.id}`}>Connections</h3>
                    {editable && eligibleConnectionTargets.length > 0 && (
                      <div className="connection-create">
                        <label>
                          Connect to
                          <select
                            value={activeConnectionTargetId}
                            onChange={(event) => setConnectionTargetId(event.target.value)}
                          >
                            <option value="">Choose a note…</option>
                            {eligibleConnectionTargets.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Relationship
                          <select value={type} onChange={(event) => setType(Number(event.target.value) as 0 | 1)}>
                            <option value={0}>Related</option>
                            <option value={1}>Prerequisite</option>
                          </select>
                        </label>
                        <Button
                          variant="secondary"
                          disabled={!activeConnectionTargetId}
                          onClick={() => void createConnection(inspectorNote.id, activeConnectionTargetId)}
                        >
                          <Link2 size={17} aria-hidden="true" /> Add connection
                        </Button>
                      </div>
                    )}
                    {editable && top.length > 1 && eligibleConnectionTargets.length === 0 && (
                      <p className="connection-complete">Every other note is already connected.</p>
                    )}
                    {edges.every((edge) =>
                      edge.sourceNoteId !== inspectorNote.id && edge.targetNoteId !== inspectorNote.id) && (
                      <p className="connection-complete">No connections yet.</p>
                    )}
                    {edges
                      .filter(
                        (edge) =>
                          edge.sourceNoteId === inspectorNote.id ||
                          edge.targetNoteId === inspectorNote.id,
                      )
                      .map((edge) => (
                        <div key={edge.id}>
                          {edge.type === 1 ? "Prerequisite" : "Related"} ·{" "}
                          {
                            top.find(
                              (n) =>
                                n.id ===
                                (edge.sourceNoteId === inspectorNote.id
                                  ? edge.targetNoteId
                                  : edge.sourceNoteId),
                            )?.title
                          }
                          {editable && (
                            <Button variant="quiet" size="compact" onClick={() => void removeEdge(edge.id)}>
                              Remove
                            </Button>
                          )}
                        </div>
                      ))}
                  </section>
                </PropertiesEditor>
            </InspectorFrame>
          )}
          {panel === "tasks" && (
            <TasksPanel
              notes={notes}
              editable={editable}
              toggle={toggle}
              edit={(item, title) => editItem(item, title)}
              remove={(item) => void removeItem(item)}
              editingChanged={editingChanged}
              close={() => setPanel(null)}
            />
          )}
          {panel === "share" && board && (
            <SharePanel
              board={board}
              members={members}
              presence={presence}
              presenceAvailable={realtimeStatus === "connected"}
              setGuest={setGuest}
              changePermission={changePermission}
              removeGuest={removeGuest}
              close={() => setPanel(null)}
            />
          )}
          {panel === "chat" && (
            <aside className="side-panel">
              <div className="panel-head">
                <h2>Board chat</h2>
                <IconButton label="Close chat" onClick={() => setPanel(null)}>
                  <X size={18} aria-hidden="true" />
                </IconButton>
              </div>
              <div className="panel-empty">
                Chat is not available on this board yet. Use notes to share ideas with your board members.
              </div>
            </aside>
          )}
        </main>
      )}
      {conflicted && (
        <Dialog title="This note changed while you were editing" urgent onClose={() => setConflicted(null)}>
          <p>
            {conflictDraft
              ? "Your draft is still safe in this browser session. Review the latest saved version before deciding what to keep."
              : "A newer saved version is available. Review it before trying your change again."}
          </p>
          {conflictLatest && (
            <div className="wk-conflict-comparison">
              {conflictDraft && (
                <section>
                  <h3>Your unsaved draft</h3>
                  <strong>{conflictDraft.title}</strong>
                  {conflictDraft.content && <p>{conflictDraft.content}</p>}
                </section>
              )}
              <section>
                <h3>Latest saved version</h3>
                <strong>{conflictLatest.title}</strong>
                {conflictLatest.content && <p>{conflictLatest.content}</p>}
              </section>
            </div>
          )}
          <div className="wk-dialog-actions">
            <Button onClick={() => void latest()}>
              {conflictLatest ? "Refresh latest saved version" : "Review latest saved version"}
            </Button>
            <Button variant="quiet" onClick={() => setConflicted(null)}>Keep editing my draft</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname),
    [session, setSession] = useState<AuthSession | null>(currentSession()),
    [starting, setStarting] = useState(true),
    [startupError, setStartupError] = useState(""),
    [notice, setNotice] = useState(""),
    [boards, setBoards] = useState<BoardListItemDto[]>([]),
    [loading, setLoading] = useState(false),
    [failure, setFailure] = useState("");
  const started = useRef(false);
  const navigate = useCallback((next: string) => {
    window.history.pushState(null, "", next);
    setPath(next);
  }, []);
  useEffect(() => {
    const pop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        if (window.location.pathname === "/auth/callback") {
          const params = new URLSearchParams(window.location.search),
            code = params.get("code"),
            error = params.get("error"),
            linked = params.get("linked");
          window.history.replaceState(null, "", "/boards");
          setPath("/boards");
          if (error) setStartupError(errorMessage(new AuthApiError(error)));
          if (code) {
            setSession(await exchangeGoogleCode(code));
            return;
          }
          if (linked) setNotice("Google account linked");
        }
        setSession(await restoreSession());
      } catch (cause) {
        setStartupError(errorMessage(cause));
      } finally {
        setStarting(false);
      }
    })();
  }, []);
  const loadBoards = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setFailure("");
    try {
      setBoards(await boardApi.list());
    } catch (cause) {
      setFailure(errorMessage(cause));
      throw cause;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);
  const onProfileUpdated = useCallback((profile: ProfileDto) => {
    setSession((current) => {
      if (!current) return current;
      const user = {
        id: profile.userId,
        email: profile.email,
        username: profile.username,
        displayName: profile.displayName,
        profileImageUrl: profile.profileImageUrl,
        profileImageVersion: profile.profileImageVersion,
      };
      reconcileSessionUser(user);
      return { ...current, user };
    });
  }, []);
  const boardLoaded = useCallback(
    (board: BoardDetailDto) =>
      setBoards((previous) => previous.map((item) =>
        item.id === board.id
          ? { ...item, title: board.title, updatedAt: board.updatedAt }
          : item)),
    [],
  );
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setSession(null);
      setBoards([]);
      setStartupError("Your session expired. Please sign in again.");
      window.history.replaceState(null, "", "/login");
      setPath("/login");
    });
    return () => setSessionExpiredHandler(null);
  }, []);
  useEffect(() => {
    if (!starting && !session && path !== "/login" && path !== "/register") {
      window.history.replaceState(null, "", "/login");
      setPath("/login");
    }
  }, [starting, session, path]);
  useEffect(() => {
    if (session) void loadBoards().catch(() => undefined);
  }, [session, loadBoards]);
  async function signOut(all: boolean) {
    try {
      if (all) await logoutEverywhere();
      else await logout();
      setSession(null);
      setBoards([]);
      navigate("/login");
    } catch (cause) {
      setNotice(errorMessage(cause));
    }
  }
  const boardId = boardFromPath(path);
  const accountSection = accountSectionForPath(path);
  useEffect(() => {
    if (path === "/account") {
      window.history.replaceState(null, "", "/account/profile");
      setPath("/account/profile");
    }
  }, [path]);
  const leaveBoard = useCallback(() => navigate("/boards"), [navigate]);
  async function renameBoard(boardId: string, title: string) {
    const updated = await boardApi.rename(boardId, title);
    setBoards((current) => current.map((item) => item.id === boardId
      ? { ...item, title: updated.title, updatedAt: updated.updatedAt }
      : item));
    setNotice("Board renamed");
  }
  async function deleteBoard(deletedId: string) {
    await boardApi.remove(deletedId);
    setBoards((current) => current.filter((item) => item.id !== deletedId));
    if (boardId === deletedId) navigate("/boards");
    setNotice("Board deleted");
  }
  useEffect(() => {
    if (!session) return;
    void realtimeConnection.start();
    return () => void realtimeConnection.stop();
  }, [session?.user.id]);
  useEffect(() => {
    if (!session) return;
    return realtimeConnection.onReconnected(() => loadBoards(false));
  }, [loadBoards, session?.user.id]);
  useEffect(() => {
    if (!session) return;
    return realtimeConnection.on<UserProfileChangedEvent>(realtimeEvents.userProfileChanged, (message) => {
      if (message.userId !== session.user.id) return;
      void profileApi.get().then(onProfileUpdated).catch(() => undefined);
    });
  }, [onProfileUpdated, session?.user.id]);
  useEffect(() => {
    if (!session) return;
    const removeChanged = realtimeConnection.on<BoardSummaryChangedEvent>(
      realtimeEvents.boardSummaryChanged,
      (message) => setBoards((current) => mergeBoardSummary(current, message)),
    );
    const removeDeleted = realtimeConnection.on<BoardScopedEvent>(
      realtimeEvents.boardSummaryRemoved,
      (message) => setBoards((current) =>
        current.filter((board) => board.id !== message.boardId)),
    );
    return () => {
      removeChanged();
      removeDeleted();
    };
  }, [session?.user.id]);
  useEffect(() => {
    if (!session || !boardId) return;
    return realtimeConnection.subscribeBoard(boardId);
  }, [boardId, session?.user.id]);
  if (starting)
    return <div className="wk-startup"><Wordmark /><p role="status">Restoring your session…</p></div>;
  if (!session)
    return (
      <AuthScreen
        mode={path === "/register" ? "register" : "login"}
        error={startupError}
        navigate={navigate}
        onSuccess={(value) => {
          setSession(value);
          setStartupError("");
          navigate("/boards");
        }}
      />
    );
  if (
    path === "/" ||
    path === "/login" ||
    path === "/register" ||
    path === "/auth/callback"
  ) {
    window.history.replaceState(null, "", "/boards");
    queueMicrotask(() => setPath("/boards"));
    return <div className="wk-startup"><Wordmark /><p role="status">Opening boards…</p></div>;
  }
  return (
    <AppShell
      user={session.user}
      boards={boards}
      activeBoardId={boardId}
      navigate={navigate}
      onRenameBoard={renameBoard}
      onDeleteBoard={deleteBoard}
      signOut={() => void signOut(false)}
      signOutEverywhere={() => void signOut(true)}
      notify={setNotice}
    >
      {path === "/library" ? <SoonPage area="Library" /> : path === "/library/pictures" ? <SoonPage area="Pictures" /> : path === "/journal" ? <SoonPage area="Journal" /> : path === "/tasks" ? <SoonPage area="Tasks" /> : accountSection ? (
        <AccountPanel
          user={session.user}
          section={accountSection}
          navigate={navigate}
          signOut={() => void signOut(false)}
          signOutEverywhere={() => void signOut(true)}
          notify={setNotice}
          onProfileUpdated={onProfileUpdated}
        />
      ) : boardId ? (
        <Workspace
          key={boardId}
          id={boardId}
          titleOverride={boards.find((item) => item.id === boardId)?.title}
          currentUserId={session.user.id}
          profileIdentityVersion={`${session.user.username}:${session.user.displayName ?? ""}:${session.user.profileImageVersion ?? ""}`}
          back={leaveBoard}
          boardLoaded={boardLoaded}
          notify={setNotice}
        />
      ) : (
        <BoardLanding
          boards={boards}
          displayName={session.user.displayName}
          loading={loading}
          failure={failure}
          retry={() => void loadBoards().catch(() => undefined)}
          navigate={navigate}
          onRenameBoard={renameBoard}
          onDeleteBoard={deleteBoard}
          create={async (title) => {
            const board = await boardApi.create(title);
            setBoards(await boardApi.list());
            setNotice("Board created");
            navigate(`/boards/${board.id}`);
          }}
        />
      )}
      {notice && (
        <Notice message={notice} onDismiss={() => setNotice("")} />
      )}
    </AppShell>
  );
}
