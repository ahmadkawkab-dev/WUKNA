import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BoardListItemDto } from "../../api";
import type { AuthSession } from "../../auth";
import { MobileHeader, MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { LibrarySidebarSlot } from './LibrarySidebarSlot';
import { isLibraryPath, libraryRoute } from '../../features/library/libraryRoutes';

export function AppShell({
  user,
  boards,
  activeBoardId,
  navigate,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  onColorBoard,
  signOut,
  signOutEverywhere,
  notify,
  children,
  libraryEnabled = false,
  renderLibraryStorage,
  renderLibraryNavigation,
}: {
  user: AuthSession["user"];
  boards: BoardListItemDto[];
  activeBoardId: string | null;
  navigate: (path: string) => void;
  onCreateBoard: (title: string) => Promise<void>;
  onRenameBoard: (id: string, title: string) => Promise<void>;
  onDeleteBoard: (id: string) => Promise<void>;
  onColorBoard: (id: string, color: BoardListItemDto['cardColor'], version: number) => Promise<void>;
  signOut: () => void;
  signOutEverywhere: () => void;
  notify: (message: string) => void;
  children: ReactNode;
  libraryEnabled?: boolean;
  renderLibraryStorage?: (navigate: (path: string) => void) => ReactNode;
  renderLibraryNavigation?: (navigate: (path: string) => void) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(min-width: 768px) and (max-width: 1199px)').matches);
  useEffect(() => {
    const tablet = window.matchMedia('(min-width: 768px) and (max-width: 1199px)');
    const adaptNavigation = () => setCollapsed(tablet.matches);
    tablet.addEventListener('change', adaptNavigation);
    return () => tablet.removeEventListener('change', adaptNavigation);
  }, []);
  const path = window.location.pathname;
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(path);
  useEffect(() => {
    const labels: Record<string, string> = { '/home': 'Home', '/boards': 'Boards', '/tasks': 'Week',
      '/tasks/quick': 'Quick tasks', '/tasks/templates': 'Templates', '/calendar': 'Calendar',
      '/notifications': 'Notifications', '/account/profile': 'Profile', '/account/preferences': 'Preferences & security' };
    document.title = `${labels[path] ?? (isLibraryPath(path) ? libraryEnabled ? `${libraryRoute(path)?.label ?? 'Page unavailable'} · Library` : 'Library' : path.startsWith('/boards/') ? 'Board' : 'Wukna')} · Wukna`;
    if (previousPath.current === path) return;
    previousPath.current = path;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      main.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [path, libraryEnabled]);
  const openBoards = () => navigate("/boards");

  return (
    <LibrarySidebarSlot.Provider value={libraryEnabled && !!renderLibraryNavigation}><div className={`wk-app-shell${collapsed ? " wk-app-shell--collapsed" : ""}`}>
      <a className="wk-skip-link" href="#wk-main-content">Skip to content</a>
      <Sidebar
        libraryEnabled={libraryEnabled}
        libraryNavigation={renderLibraryNavigation?.(navigate)}
        libraryStorage={renderLibraryStorage?.(navigate)}
        user={user}
        boards={boards}
        activeBoardId={activeBoardId}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        navigate={navigate}
        onCreateBoard={onCreateBoard}
        onRenameBoard={onRenameBoard}
        onDeleteBoard={onDeleteBoard}
        onColorBoard={onColorBoard}
        onOpenAccount={() => navigate("/account/profile")}
      />
      <MobileHeader user={user} onHome={() => navigate("/home")} onOpenAccount={() => navigate("/account/profile")} />
      <main ref={main} tabIndex={-1} className="wk-shell-main" id="wk-main-content">
        <div className="wk-feature-stage">{children}</div>
      </main>
      <MobileNav onBoards={openBoards} navigate={navigate} libraryEnabled={libraryEnabled} renderLibraryStorage={renderLibraryStorage} />
    </div></LibrarySidebarSlot.Provider>
  );
}
