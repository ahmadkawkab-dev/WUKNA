import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { MemberDto } from "../../api";
import { AuthApiError, errorMessage } from "../../api";
import { identityLabel } from "../../components/ui/Avatar";

export type MemberMenuAnchor = { x: number; y: number; trigger: HTMLElement };

export function memberActionError(cause: unknown) {
  if (cause instanceof AuthApiError) {
    if (cause.status === 403) return "You no longer have permission to manage this board.";
    if (cause.status === 404) return "This member is no longer part of the board.";
    if (cause.status === 409) return "This membership changed. Refresh the board and try again.";
  }
  return errorMessage(cause);
}

export function MemberActionsMenu({ member, anchor, onClose, onPermission, onRemove }: {
  member: MemberDto;
  anchor: MemberMenuAnchor;
  onClose: (restoreFocus?: boolean) => void;
  onPermission: (member: MemberDto, canEdit: boolean) => Promise<void>;
  onRemove: (member: MemberDto) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = identityLabel(member);

  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const left = anchor.x + width <= window.innerWidth - 8
      ? anchor.x : Math.max(8, anchor.x - width);
    const top = anchor.y + height <= window.innerHeight - 8
      ? anchor.y : Math.max(8, anchor.y - height);
    setPosition({ left, top });
    element.querySelector<HTMLElement>("[aria-checked='true']")?.focus();
  }, [anchor.x, anchor.y]);

  useLayoutEffect(() => {
    function outside(event: PointerEvent) {
      if (menu.current?.contains(event.target as Node) ||
          anchor.trigger.contains(event.target as Node)) return;
      onClose();
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [anchor.trigger, onClose]);

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const options = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("[role^='menuitem']:not(:disabled)") ?? []);
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      options[(index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      options[event.key === "Home" ? 0 : options.length - 1]?.focus();
    } else if (event.key === "Tab") {
      onClose(false);
    }
  }
  async function change(canEdit: boolean) {
    if (busy || member.canEdit === canEdit) return;
    setBusy(true);
    setError("");
    try {
      await onPermission(member, canEdit);
      onClose();
    } catch (cause) {
      setError(memberActionError(cause));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div ref={menu} className="wk-member-menu" role="menu" aria-label={`Actions for ${name}`}
      style={position} onKeyDown={keyboard}>
      <strong role="presentation">{name}</strong>
      <span className="wk-member-menu-label" role="presentation">Permission</span>
      <button type="button" role="menuitemradio" aria-checked={!member.canEdit}
        disabled={busy} onClick={() => void change(false)}>
        <span aria-hidden="true">{!member.canEdit ? "✓" : ""}</span> Viewer
      </button>
      <button type="button" role="menuitemradio" aria-checked={member.canEdit}
        disabled={busy} onClick={() => void change(true)}>
        <span aria-hidden="true">{member.canEdit ? "✓" : ""}</span> Editor
      </button>
      <div className="wk-member-menu-rule" role="separator" />
      <button type="button" role="menuitem" className="wk-member-menu-danger"
        disabled={busy} onClick={() => onRemove(member)}>Remove from board</button>
      {error && <p role="alert" className="wk-alert">{error}</p>}
    </div>,
    document.body,
  );
}
