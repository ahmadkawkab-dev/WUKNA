import { useMemo } from "react";
import type { MemberDto } from "../../api";
import type { BoardPresenceSnapshot } from "../../realtime/events";
import {
  collaboratorInitials,
  collaboratorStyle,
} from "./collaboratorIdentity";
import { Avatar, identityLabel } from "../../components/ui/Avatar";

function fallbackInitial(userId: string) {
  return userId.replaceAll("-", "").slice(0, 2).toUpperCase() || "?";
}

export function BoardPresence({
  snapshot,
  members,
  available,
}: {
  snapshot: BoardPresenceSnapshot | null;
  members: MemberDto[];
  available: boolean;
}) {
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );
  if (!available || !snapshot) return null;

  const viewers = snapshot.viewers.map((viewer) => {
    const member = memberById.get(viewer.userId);
    const label = member ? identityLabel(member) : "Board viewer";
    return {
      ...viewer,
      label,
      initials: member
        ? collaboratorInitials(label)
        : fallbackInitial(viewer.userId),
    };
  });
  const count = viewers.length;
  const countLabel = count === 1 ? "1 viewer" : `${count} people viewing`;
  const visible = viewers.slice(0, 3);
  const remaining = count - visible.length;

  return (
    <details className="wk-presence">
      <summary aria-label={`${countLabel}. Show viewer list`}>
        <span className="wk-presence-avatars" aria-hidden="true">
          {visible.map((viewer) => (
            <Avatar key={viewer.userId} identity={memberById.get(viewer.userId) ?? { displayName: viewer.label }} size="small"
              className="wk-presence-avatar" style={collaboratorStyle(viewer.userId)} tooltip />
          ))}
          {remaining > 0 && <span className="wk-presence-more">+{remaining}</span>}
        </span>
        <span className="wk-presence-count">{countLabel}</span>
      </summary>
      <div className="wk-presence-list">
        <strong>Viewing now</strong>
        {viewers.map((viewer) => (
          <div key={viewer.userId}>
            <Avatar identity={memberById.get(viewer.userId) ?? { displayName: viewer.label }} size="small"
              className="wk-presence-avatar" style={collaboratorStyle(viewer.userId)} />
            <span>
              <b>{viewer.label}</b>
              {memberById.get(viewer.userId)?.username && <small>@{memberById.get(viewer.userId)!.username}</small>}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
