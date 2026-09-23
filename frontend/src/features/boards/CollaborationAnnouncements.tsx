import { useEffect, useMemo, useRef, useState } from "react";
import type { MemberDto, NoteDto } from "../../api";
import type { RealtimeStatus } from "../../realtime/connection";
import { editingUserIds, type NoteEditingByNote } from "../../realtime/editing";
import { identityLabel } from "../../components/ui/Avatar";

export function CollaborationAnnouncements({
  editing,
  members,
  notes,
  currentUserId,
  realtimeStatus,
}: {
  editing: NoteEditingByNote;
  members: MemberDto[];
  notes: NoteDto[];
  currentUserId: string;
  realtimeStatus: RealtimeStatus;
}) {
  const [announcement, setAnnouncement] = useState("");
  const previous = useRef(new Map<string, Set<string>>());
  const initialized = useRef(false);
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );
  const noteById = useMemo(
    () => new Map(notes.map((note) => [note.id, note])),
    [notes],
  );
  const editorsByNote = useMemo(() => {
    const next = new Map<string, Set<string>>();
    for (const [noteId, connections] of Object.entries(editing))
      next.set(noteId, new Set(editingUserIds(connections, currentUserId)));
    return next;
  }, [currentUserId, editing]);

  useEffect(() => {
    if (!initialized.current || realtimeStatus !== "connected") {
      initialized.current = true;
      previous.current = editorsByNote;
      return;
    }

    const messages: string[] = [];
    const noteIds = new Set([...previous.current.keys(), ...editorsByNote.keys()]);
    for (const noteId of noteIds) {
      const before = previous.current.get(noteId) ?? new Set<string>();
      const after = editorsByNote.get(noteId) ?? new Set<string>();
      const noteTitle = noteById.get(noteId)?.title ?? "this note";
      for (const userId of after) {
        if (before.has(userId)) continue;
        const member = memberById.get(userId);
        messages.push(`${member ? identityLabel(member) : "Someone"} started editing “${noteTitle}”.`);
      }
      for (const userId of before) {
        if (after.has(userId)) continue;
        const member = memberById.get(userId);
        messages.push(`${member ? identityLabel(member) : "Someone"} stopped editing “${noteTitle}”.`);
      }
    }
    previous.current = editorsByNote;
    const message = messages.at(-1);
    if (message) setAnnouncement(message);
  }, [editorsByNote, memberById, noteById, realtimeStatus]);

  return (
    <div className="wk-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  );
}
