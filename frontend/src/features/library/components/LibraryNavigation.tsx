import { FileText, FolderOpen, HardDrive, Heart, Images, Search, Trash2, Video } from 'lucide-react';
import { libraryDestinations, type LibrarySection } from '../libraryRoutes';
import { useLibraryCollections, useLibrarySummary } from '../hooks/useLibraryQueries';
import { Button } from '../../../components/ui/Button';
import type { LibraryCategory } from '../types';

function LibraryDashboardIcon({ size = 16 }: { size?: number }) {
  return <span className="wk-library-dashboard-icon" style={{ width: size, height: size }} aria-hidden="true" />;
}

const icons = { dashboard: LibraryDashboardIcon, pictures: Images, documents: FileText, videos: Video,
  collections: FolderOpen, favorites: Heart, trash: Trash2, storage: HardDrive, search: Search };
const categories: Partial<Record<LibrarySection, LibraryCategory>> = { pictures: 'picture', documents: 'document', videos: 'video' };

export function LibraryNavigation({ section, navigate }: { section: LibrarySection | null; navigate: (path: string) => void }) {
  const summary = useLibrarySummary();
  const collections = useLibraryCollections();
  return <nav className="wk-library-navigation" aria-label="Library navigation">
    {libraryDestinations.filter(destination => destination.section !== 'storage').map(destination => {
      const Icon = icons[destination.section];
      const count = destination.section === 'dashboard' ? summary.data?.categories.reduce((total, row) => total + row.itemCount, 0)
        : destination.section === 'collections' ? collections.data?.pages.reduce((total, page) => total + page.items.length, 0)
        : summary.data?.categories.find(row => row.category === categories[destination.section])?.itemCount;
      return <button key={destination.section} className={`wk-shell-link wk-library-link${destination.section === 'favorites' || destination.section === 'trash' ? ' wk-library-link--utility' : ''}`} type="button" aria-current={section === destination.section ? 'page' : undefined}
        onClick={() => navigate(destination.path)}><Icon size={16} aria-hidden="true" /><span>{destination.label}</span>
        {count !== undefined && <small aria-label={`${count} items`}>{count}</small>}</button>;
    })}
  </nav>;
}

export function LibraryCollectionShortcuts({ onCollection, navigate }: { onCollection?: (id: string) => void; navigate: (path: string) => void }) {
  const result = useLibraryCollections();
  const rows = result.data?.pages.flatMap(page => page.items).slice(0, 4) ?? [];
  if (!rows.length) return null;
  return <nav className="wk-library-collection-shortcuts" aria-label="Your collections"><p>Your collections</p>
    {rows.map(row => <button type="button" key={row.id} className="wk-board-link" title={row.name} onClick={() => onCollection ? onCollection(row.id) : navigate('/library/collections')}><span className="wk-board-link-title">{row.name}</span></button>)}
    {(result.hasNextPage || (result.data?.pages.flatMap(page => page.items).length ?? 0) > 4) && <Button variant="quiet" size="compact" onClick={() => navigate('/library/collections')}>All collections →</Button>}
  </nav>;
}
