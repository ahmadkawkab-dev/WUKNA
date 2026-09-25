import { useCallback, useEffect, useRef, useState } from "react";
import { realtimeConnection } from "../../../realtime/connection";
import { applyEditingStarted, applyEditingStopped, type NoteEditingByNote } from "../../../realtime/editing";
import type { NoteEditingStartedEvent, NoteEditingStoppedEvent } from "../../../realtime/events";

export function useBoardEditing(id: string) {
  const [remoteEditing, setRemoteEditing] = useState<NoteEditingByNote>({});
  const remoteEditingRef = useRef<NoteEditingByNote>({});
  const remoteEditingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const editingSequence = useRef(0);
  const localEditing = useRef<{
    noteId: string;
    renewal: ReturnType<typeof setInterval> | null;
    pendingStop: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const clearAllRemoteEditing = useCallback(() => {
    for (const timer of remoteEditingTimers.current.values()) clearTimeout(timer);
    remoteEditingTimers.current.clear();
    remoteEditingRef.current = {};
    setRemoteEditing({});
  }, []);
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
  useEffect(() => () => {
    for (const timer of remoteEditingTimers.current.values()) clearTimeout(timer);
    remoteEditingTimers.current.clear();
    remoteEditingRef.current = {};
    stopLocalEditingNow();
  }, [stopLocalEditingNow]);

  return { remoteEditing, clearAllRemoteEditing, clearRemoteEditingForNote,
    acceptRemoteEditing, endRemoteEditing, stopLocalEditingNow,
    editingChanged, finishEditing, reannounceLocalEditing };
}
