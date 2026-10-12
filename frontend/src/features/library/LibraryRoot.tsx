import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '../../components/ui/Button';
import { LibraryProvider, useOptionalLibraryApi } from './LibraryProvider';
import { LibraryShell } from './components/LibraryShell';
import { LibrarySearch } from './components/LibrarySearch';
import { LibraryUIProvider, type LibraryAction } from './components/LibraryUI';
import { LibraryActionDialog } from './components/LibraryActionDialog';
import { LibraryItemViewer } from './components/LibraryItemViewer';
import { LibraryDashboard } from './views/LibraryDashboard';
import { LibraryBrowse } from './views/LibraryBrowse';
import { LibraryCollections } from './views/LibraryCollections';
import { LibraryStorage } from './views/LibraryStorage';
import { libraryRoute } from './libraryRoutes';
import './library.css';

const collectionSnapshot = () => new URLSearchParams(window.location.search).get('collection') ?? undefined;
const subscribeNavigation = (listener: () => void) => {
  window.addEventListener('wukna:navigation', listener);
  window.addEventListener('popstate', listener);
  return () => { window.removeEventListener('wukna:navigation', listener); window.removeEventListener('popstate', listener); };
};

export function LibraryRoot({ accountId, path, navigate }: { accountId: string; path: string; navigate: (path: string) => void }) {
  const context = useOptionalLibraryApi();
  if (context) return <LibraryWorkspace path={path} navigate={navigate} />;
  return <LibraryProvider accountId={accountId}><LibraryWorkspace path={path} navigate={navigate} /></LibraryProvider>;
}
function LibraryWorkspace({ path, navigate }: { path: string; navigate: (path: string) => void }) {
  const [action, setAction] = useState<LibraryAction | null>(null); const [viewer, setViewer] = useState<{ id: string; ids: string[] } | null>(null);
  const collectionId = useSyncExternalStore(subscribeNavigation, collectionSnapshot);
  const [message, setMessage] = useState(''); const [search, setSearch] = useState('');
  useEffect(() => { setAction(null); setViewer(null); }, [path]);
  const route = libraryRoute(path);
  const go = (target: string) => navigate(target);
  const openCollection = (id?: string) => navigate(id ? `/library/collections?collection=${encodeURIComponent(id)}` : '/library/collections');
  return <LibraryUIProvider value={{ act: setAction, open: (id, ids = [id]) => setViewer({ id, ids }), navigate: go, openCollection, notify: setMessage }}><LibraryShell path={path} navigate={go} onCollection={openCollection} onSearch={term => { setSearch(term); go('/library/search'); }}>
    {message && <div className="wk-lib-feedback"><p role="status">{message}</p><Button variant="quiet" onClick={() => setMessage('')}>Dismiss</Button></div>}
    {route?.section === 'dashboard' ? <LibraryDashboard /> : route?.section === 'collections' ? <LibraryCollections selectedId={collectionId} onSelect={openCollection} /> : route?.section === 'storage' ? <LibraryStorage /> : route?.section === 'search' ? <LibrarySearch key={search} initialTerm={search} /> : route ? <LibraryBrowse key={route.section} category={route.section === 'pictures' ? 'picture' : route.section === 'documents' ? 'document' : route.section === 'videos' ? 'video' : undefined} favorite={route.section === 'favorites'} trash={route.section === 'trash'} /> : <section className="wk-lib-state"><h2>This Library destination is unavailable</h2><Button onClick={() => navigate('/library')}>Back to Library</Button></section>}
    {viewer && <LibraryItemViewer id={viewer.id} ids={viewer.ids} onChange={id => setViewer(current => current ? { ...current, id } : null)} onClose={() => setViewer(null)} />}
    {action && <LibraryActionDialog action={action} onClose={() => setAction(null)} />}
  </LibraryShell></LibraryUIProvider>;
}
