import { useEffect, useRef, useState } from "react";
import type { NoteDto } from "../../../api";
import { useEditorActions, useNoteDraft } from "../editor/EditorStateProvider";

export function InlineNoteText({
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
