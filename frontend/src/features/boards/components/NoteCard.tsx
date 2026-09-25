import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as Pointer,
} from "react";
import { GripVertical, ListChecks, Plus, Settings2, StickyNote, X } from "lucide-react";
import type { NoteDto } from "../../../api";
import { Avatar } from "../../../components/ui/Avatar";
import { IconButton } from "../../../components/ui/Button";
import { collaboratorStyle } from "../collaboratorIdentity";
import { isDragGesture } from "../gesture";
import { InlineNoteText } from "./InlineNoteText";
import { NoteEditingIndicator, type EditingViewer } from "../NoteEditingIndicator";
import { noteAppearanceStyle } from "../noteAppearance";
import { clampDimension, noteDimensionBounds } from "../noteDimensions";
import { useNoteDraft } from "../editor/EditorStateProvider";
import type { NoteGeometryOperation } from "../../../realtime/events";
import type { RemoteGeometryPresentation, VisualPatch } from "../boardTypes";

export function NoteCard({
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
