import { collaboratorStyle } from "./collaboratorIdentity";
import { Avatar } from "../../components/ui/Avatar";

export type EditingViewer = {
  userId: string;
  label: string;
  initials: string;
  identity?: { displayName?: string | null; username?: string | null; email?: string | null; profileImageUrl?: string | null };
};

function editingLabel(editors: EditingViewer[]) {
  if (editors.length === 1) return `${editors[0].label} is editing`;
  if (editors.length === 2)
    return `${editors[0].label} and ${editors[1].label} are editing`;
  return `${editors.length} people are editing`;
}

export function NoteEditingIndicator({ editors }: { editors: EditingViewer[] }) {
  if (!editors.length) return null;
  const label = editingLabel(editors);
  return (
    <div className="wk-note-editing">
      <span className="wk-note-editing-avatars" aria-hidden="true">
        {editors.slice(0, 2).map((editor) => (
          <Avatar key={editor.userId} identity={editor.identity ?? { displayName: editor.label }} size="small" style={collaboratorStyle(editor.userId)} />
        ))}
      </span>
      <small aria-hidden="true">{editors.length > 2 ? label : editors.length === 1 ? "editing" : "editing together"}</small>
      <span className="wk-sr-only">{label}</span>
    </div>
  );
}
