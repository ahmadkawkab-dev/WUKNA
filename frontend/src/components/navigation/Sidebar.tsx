import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { BookOpen, Images, LayoutGrid, ListChecks, NotebookPen, PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";
import type { BoardListItemDto } from "../../api";
import type { AuthSession } from "../../auth";
import { BoardActionsDialog } from "../../features/boards/BoardActionsDialog";
import { Wordmark } from "../brand/Wordmark";
import { IconButton } from "../ui/Button";
import { Avatar, identityLabel } from "../ui/Avatar";

export function Sidebar({
  user,
  boards,
  activeBoardId,
  collapsed,
  onToggle,
  navigate,
  onRenameBoard,
  onDeleteBoard,
  onOpenAccount,
}: {
  user: AuthSession["user"];
  boards: BoardListItemDto[];
  activeBoardId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  navigate: (path: string) => void;
  onRenameBoard: (id: string, title: string) => Promise<void>;
  onDeleteBoard: (id: string) => Promise<void>;
  onOpenAccount: () => void;
}) {
  const [actionTarget, setActionTarget] = useState<BoardListItemDto | null>(null);
  const owned = boards.filter((board) => board.role === 1);
  const shared = boards.filter((board) => board.role !== 1);
  const path = window.location.pathname;
  function startActions(board: BoardListItemDto) {
    setActionTarget(board);
  }
  function contextMenu(event: MouseEvent<HTMLButtonElement>, board: BoardListItemDto) {
    if (board.role !== 1) return;
    event.preventDefault();
    startActions(board);
  }
  function contextKey(event: KeyboardEvent<HTMLButtonElement>, board: BoardListItemDto) {
    if (board.role !== 1 || !(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey)) return;
    event.preventDefault();
    startActions(board);
  }
  const boardLink = (board: BoardListItemDto) => (
    <button
      className={`wk-board-link${activeBoardId === board.id ? " wk-board-link--active" : ""}`}
      key={board.id}
      onClick={() => navigate(`/boards/${board.id}`)}
      onContextMenu={(event) => contextMenu(event, board)}
      onKeyDown={(event) => contextKey(event, board)}
      aria-current={activeBoardId === board.id ? "page" : undefined}
      aria-keyshortcuts={board.role === 1 ? "Shift+F10" : undefined}
      title={board.role === 1 ? `${board.title} · Right-click for board actions` : board.title}
    >
      <span className="wk-board-dot" aria-hidden="true" />
      <span>{board.title}</span>
    </button>
  );
  return (
    <aside className={`wk-sidebar${collapsed ? " wk-sidebar--collapsed" : ""}`}>
      <div className="wk-sidebar-header">
        <button className="wk-sidebar-brand" onClick={() => navigate("/boards")} aria-label="Wukna boards">
          <Wordmark />
        </button>
        <IconButton
          label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </IconButton>
      </div>

      <nav className="wk-sidebar-nav" aria-label="Primary navigation">
        <button className={`wk-shell-link${path.startsWith("/boards") ? " wk-shell-link--active" : ""}`} aria-label="Boards" aria-current={path.startsWith("/boards") ? "page" : undefined} onClick={() => navigate("/boards")}>
          <LayoutGrid size={19} aria-hidden="true" />
          <span>Boards</span>
        </button>
        <button className={`wk-shell-link${path === "/tasks" ? " wk-shell-link--active" : ""}`} aria-label="Tasks, coming soon" aria-current={path === "/tasks" ? "page" : undefined} onClick={() => navigate("/tasks")}><ListChecks size={19} aria-hidden="true" /><span>Tasks</span><small className="wk-nav-soon">Soon</small></button>
        <button className={`wk-shell-link${path.startsWith("/library") ? " wk-shell-link--active" : ""}`} aria-label="Library, coming soon" aria-current={path === "/library" ? "page" : undefined} onClick={() => navigate("/library")}><BookOpen size={19} aria-hidden="true" /><span>Library</span><small className="wk-nav-soon">Soon</small></button>
        <button className={`wk-shell-link wk-shell-sublink${path === "/library/pictures" ? " wk-shell-link--active" : ""}`} aria-label="Pictures, coming soon" aria-current={path === "/library/pictures" ? "page" : undefined} onClick={() => navigate("/library/pictures")}><Images size={18} aria-hidden="true" /><span>Pictures</span><small className="wk-nav-soon">Soon</small></button>
        <button className={`wk-shell-link${path === "/journal" ? " wk-shell-link--active" : ""}`} aria-label="Journal, coming soon" aria-current={path === "/journal" ? "page" : undefined} onClick={() => navigate("/journal")}><NotebookPen size={19} aria-hidden="true" /><span>Journal</span><small className="wk-nav-soon">Soon</small></button>

        <div className="wk-sidebar-boards">
          <p>Your boards</p>
          <div>
            {owned.map(boardLink)}
            {shared.length > 0 && <p className="wk-sidebar-shared-label">Shared with you</p>}
            {shared.map(boardLink)}
          </div>
        </div>
      </nav>

      <button className="wk-sidebar-account" onClick={onOpenAccount} aria-label={`Open account for ${identityLabel(user)}`}>
        <Avatar identity={user} size="medium" />
        <span className="wk-sidebar-account-copy">
          <strong>{identityLabel(user)}</strong>
          <small>Account & appearance</small>
        </span>
        <UserRound size={18} aria-hidden="true" />
      </button>
      {actionTarget && (
        <BoardActionsDialog key={actionTarget.id} board={actionTarget}
          onClose={() => setActionTarget(null)}
          onRenameBoard={onRenameBoard} onDeleteBoard={onDeleteBoard} />
      )}
    </aside>
  );
}
