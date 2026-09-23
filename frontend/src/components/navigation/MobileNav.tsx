import { BookOpen, LayoutGrid, NotebookPen, UserRound } from "lucide-react";
import { Wordmark } from "../brand/Wordmark";
import { IconButton } from "../ui/Button";
import { Avatar, identityLabel } from "../ui/Avatar";
import type { AuthSession } from "../../auth";

export function MobileHeader({ onBoards, onOpenAccount, user }: { onBoards: () => void; onOpenAccount: () => void; user: AuthSession["user"] }) {
  return (
    <header className="wk-mobile-header">
      <button className="wk-mobile-brand" onClick={onBoards} aria-label="Wukna boards">
        <Wordmark />
      </button>
      <IconButton label={`Open account for ${identityLabel(user)}`} title={identityLabel(user)} onClick={onOpenAccount}>
        <Avatar identity={user} size="small" />
      </IconButton>
    </header>
  );
}

export function MobileNav({ onBoards, onOpenAccount, navigate }: { onBoards: () => void; onOpenAccount: () => void; navigate: (path: string) => void }) {
  const path = window.location.pathname;
  return (
    <nav className="wk-mobile-nav" aria-label="Primary navigation">
      <button className={`wk-mobile-nav-item${path.startsWith("/boards") ? " wk-mobile-nav-item--active" : ""}`} onClick={onBoards}>
        <LayoutGrid size={20} aria-hidden="true" />
        <span>Boards</span>
      </button>
      <button className={`wk-mobile-nav-item${path.startsWith("/library") ? " wk-mobile-nav-item--active" : ""}`} onClick={() => navigate("/library")}><BookOpen size={20} /><span>Library <small>Soon</small></span></button>
      <button className={`wk-mobile-nav-item${path === "/journal" ? " wk-mobile-nav-item--active" : ""}`} onClick={() => navigate("/journal")}><NotebookPen size={20} /><span>Journal <small>Soon</small></span></button>
      <button className="wk-mobile-nav-item" onClick={onOpenAccount}>
        <UserRound size={20} aria-hidden="true" />
        <span>Account</span>
      </button>
    </nav>
  );
}
