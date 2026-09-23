import { useState, type ReactNode } from "react";
import type { BoardListItemDto } from "../../api";
import type { AuthSession } from "../../auth";
import { MobileHeader, MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

export function AppShell({
  user,
  boards,
  activeBoardId,
  navigate,
  onRenameBoard,
  onDeleteBoard,
  signOut,
  signOutEverywhere,
  notify,
  children,
}: {
  user: AuthSession["user"];
  boards: BoardListItemDto[];
  activeBoardId: string | null;
  navigate: (path: string) => void;
  onRenameBoard: (id: string, title: string) => Promise<void>;
  onDeleteBoard: (id: string) => Promise<void>;
  signOut: () => void;
  signOutEverywhere: () => void;
  notify: (message: string) => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const openBoards = () => navigate("/boards");

  return (
    <div className={`wk-app-shell${collapsed ? " wk-app-shell--collapsed" : ""}`}>
      <a className="wk-skip-link" href="#wk-main-content">Skip to content</a>
      <Sidebar
        user={user}
        boards={boards}
        activeBoardId={activeBoardId}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        navigate={navigate}
        onRenameBoard={onRenameBoard}
        onDeleteBoard={onDeleteBoard}
        onOpenAccount={() => navigate("/account/profile")}
      />
      <MobileHeader user={user} onBoards={openBoards} onOpenAccount={() => navigate("/account/profile")} />
      <main className="wk-shell-main" id="wk-main-content">
        <div className="wk-feature-stage">{children}</div>
      </main>
      <MobileNav onBoards={openBoards} onOpenAccount={() => navigate("/account/profile")} navigate={navigate} />
    </div>
  );
}
