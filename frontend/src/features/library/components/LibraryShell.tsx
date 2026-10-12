import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, LockKeyhole, Search } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { SearchInput } from '../../../components/ui/SearchInput';
import { LibrarySidebarSlot } from '../../../components/navigation/LibrarySidebarSlot';
import { LibraryNavigation, LibraryCollectionShortcuts } from './LibraryNavigation';
import { libraryRoute } from '../libraryRoutes';

export function LibraryShell({ path, navigate, children, onSearch, onCollection, initialSearch = '', onClearSearch }: { path: string; navigate: (path: string) => void; children: ReactNode; onSearch?: (term: string) => void; onCollection?: (id: string) => void; initialSearch?: string; onClearSearch?: () => void }) {
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => { setSearch(initialSearch); }, [initialSearch, path]);
  const hasShellNavigation = useContext(LibrarySidebarSlot);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [desktop, setDesktop] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 768px)');
    const adapt = () => setDesktop(media.matches);
    adapt(); media.addEventListener('change', adapt);
    return () => media.removeEventListener('change', adapt);
  }, []);
  const integrated = hasShellNavigation && desktop;
  const destination = libraryRoute(path);
  const closeMenu = () => {
    if (!menuOpen) return;
    setMenuOpen(false);
    menuToggle.current?.focus();
  };
  const go = (target: string) => navigate(target);
  const rail = <div className="wk-library-rail">
    <LibraryNavigation section={destination?.section ?? null} navigate={go} />
    <LibraryCollectionShortcuts onCollection={onCollection} navigate={go} />
  </div>;
  return <div className={`wk-library${integrated ? ' wk-library--integrated' : ''}`}>
    <header className="wk-library-heading"><div><p className="wk-library-private"><LockKeyhole size={14} aria-hidden="true" /> Personal Library</p>
      <h1>{destination?.label ?? 'Page unavailable'}</h1>
      <nav className="wk-library-breadcrumbs" aria-label="Library breadcrumbs">
        {destination?.section === 'dashboard' ? <span aria-current="page">Library</span> : <><button type="button" onClick={() => navigate('/library')}>Library</button>
          <ChevronRight size={12} aria-hidden="true" /><span aria-current="page">{destination?.label ?? 'Page unavailable'}</span></>}
      </nav></div>{onSearch && <form className="wk-lib-header-search" onSubmit={event => { event.preventDefault(); onSearch(search.trim()); }}><div className="wk-lib-header-search-field"><Search size={16} aria-hidden="true" /><SearchInput aria-label="Search your library" clearLabel="Clear Library header search" placeholder="Search your library" value={search} maxLength={200} onValueChange={setSearch} onClear={onClearSearch} /></div><Button type="submit" variant="secondary">Search</Button></form>}</header>
    <div className="wk-library-layout">{!integrated && <aside>{desktop ? rail : <div className="wk-library-section-menu" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { event.preventDefault(); closeMenu(); } }}>
      <button ref={menuToggle} type="button" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen(value => !value)}><span>Library sections</span><strong>{destination?.label ?? 'Library'}</strong><ChevronDown size={16} aria-hidden="true" /></button>
      <div id={menuId} className="wk-sidebar-library-slot" data-open={menuOpen} inert={!menuOpen} aria-hidden={!menuOpen}><div className="wk-sidebar-library-inner">{rail}</div></div>
    </div>}</aside>}<div className="wk-library-content">{children}</div></div>
  </div>;
}
