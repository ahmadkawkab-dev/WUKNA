import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as Pointer,
} from "react";
import {
  ArrowLeft,
  Link2,
  ListChecks,
  MessageSquare,
  Plus,
  Share2,
  Sparkles,
  StickyNote,
  X,
} from "lucide-react";
import {
  AuthApiError,
  boardApi,
  connectionApi,
  errorMessage,
  noteApi,
  type BoardDetailDto,
  type ConnectionDto,
  type MemberDto,
  type NoteDto,
  type PatchNote,
} from "../../api";
import { Dialog } from "../../components/ui/Dialog";
import { Button, IconButton } from "../../components/ui/Button";
import { BoardPresence } from "./BoardPresence";
import { SharePanel, TasksPanel } from "./components/BoardPanels";
import type { VisualPatch } from "./boardTypes";
import { isNoteConflict, useNoteMutationQueue } from "./hooks/useNoteMutationQueue";
import { useBoardCursors } from "./hooks/useBoardCursors";
import { useBoardEditing } from "./hooks/useBoardEditing";
import { NoteCard } from "./components/NoteCard";
import { InspectorFrame, PropertiesEditor } from "./components/BoardInspector";
import type { EditingViewer } from "./NoteEditingIndicator";
import {
  RemoteCursors,
} from "./RemoteCursors";
import { collaboratorInitials } from "./collaboratorIdentity";
import { identityLabel } from "../../components/ui/Avatar";
import { CollaborationAnnouncements } from "./CollaborationAnnouncements";
import {
  connectedNoteIds,
  nearestConnectionPath,
  notesAreConnected,
} from "./connectionGeometry";
import { clampDimension, noteDimensionBounds } from "./noteDimensions";
import { RealtimeHealth } from "./RealtimeHealth";
import {
  clientPointToBoard,
  revealBoardNode,
} from "./boardViewport";
import {
  EditorStateProvider,
  useEditorActions,
  useEditorNavigation,
  useNoteDraft,
} from "./editor/EditorStateProvider";
import { realtimeConnection } from "../../realtime/connection";
import {
  realtimeEvents,
  type ProfileChangedEvent,
  type BoardScopedEvent,
  type BoardPresenceSnapshot,
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
} from "../../realtime/events";
import {
  mergePresenceSnapshot,
  mergeVersionedNote,
  removeVersionedNote,
  shouldAcceptGeometryPreview,
  shouldClearGeometryPreview,
  shouldEndGeometryPreview,
} from "../../realtime/reconcile";
import { editingUserIds } from "../../realtime/editing";

type Panel = "tasks" | "share" | "chat" | null;
type ConnectionDraft = {
  sourceId: string;
  x: number;
  y: number;
  targetId: string | null;
};
type WorkspaceProps = {
  id: string;
  titleOverride?: string;
  currentUserId: string;
  profileIdentityVersion: string;
  back: () => void;
  boardLoaded: (board: BoardDetailDto) => void;
  notify: (message: string) => void;
};

export function Workspace(props: WorkspaceProps) {
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
    [presence, setPresence] = useState<BoardPresenceSnapshot | null>(null),
    [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null),
    [connectionTargetId, setConnectionTargetId] = useState("");
  const realtimeStatus = useSyncExternalStore(
    realtimeConnection.subscribe,
    realtimeConnection.getSnapshot,
  );
  useEffect(() => {
    void boardApi.members(id).then(setMembers).catch(() => undefined);
  }, [id, profileIdentityVersion]);
  const notesRef = useRef<NoteDto[]>([]);
  const permissionRef = useRef<boolean | null>(null);
  const noteTombstones = useRef(new Map<string, number>());
  const { enqueueNote, blockedNotes } = useNoteMutationQueue(notesRef);
  const colorTimers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; color: string }>());
  const draftRef = useRef<ConnectionDraft | null>(null);
  const geometrySequence = useRef(0);
  const remotePreviewsRef = useRef<Record<string, NoteGeometryPreviewEvent>>({});
  const remotePreviewEnds = useRef(new Map<string, number>());
  const remotePreviewTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const canvasRef = useRef<HTMLDivElement>(null);
  const { remoteEditing, clearAllRemoteEditing, clearRemoteEditingForNote,
    acceptRemoteEditing, endRemoteEditing, stopLocalEditingNow,
    editingChanged, finishEditing, reannounceLocalEditing } = useBoardEditing(id);
  const { cursorStore, clearAllRemoteCursors, acceptRemoteCursor, endRemoteCursor,
    stopLocalCursor, moveLocalCursor } = useBoardCursors(id, currentUserId, canvasRef);
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
    if (isNoteConflict(cause)) {
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
                {editable && (
                  <Button className="canvas-empty-add-note" onClick={() => void create(0)}>
                    <Plus size={18} aria-hidden="true" />
                    <span>Add note</span>
                  </Button>
                )}
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
