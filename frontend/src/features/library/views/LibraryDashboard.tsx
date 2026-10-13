import { Folder, Image, FileText, Video, Upload } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useLibraryCapabilities, useLibraryCollections, useLibraryItems, useLibrarySummary } from '../hooks/useLibraryQueries';
import { ItemCard } from '../components/ItemCard';
import { categoryNames, categoryPath, ItemIcon, LibraryState, SectionHeading, useLibraryUI } from '../components/LibraryUI';
import { LibrarySearch } from '../components/LibrarySearch';
import { libraryDashboardPath } from '../libraryRoutes';
import { useLibraryDrop } from '../hooks/useLibraryDrop';

export function LibraryDashboard({ search = '', browseAll = false, onShowOverview }: { search?: string; browseAll?: boolean; onShowOverview?: () => void }) {
  return search || browseAll ? <LibrarySearch term={search} onShowOverview={onShowOverview} /> : <LibraryOverview />;
}

function LibraryOverview() {
  const drop = useLibraryDrop();
  const { act, open, navigate, openCollection } = useLibraryUI(); const summary = useLibrarySummary();
  const recent = useLibraryItems({ limit: 12, sort: 'updated-desc' }); const favorites = useLibraryItems({ favorite: true, limit: 4 }); const collections = useLibraryCollections();
  const capabilities = useLibraryCapabilities(); const uploadsAvailable = capabilities.data?.storageAvailable === true;
  const rows = recent.data?.pages.flatMap(page => page.items) ?? [];
  const featured = rows.slice(0, 6);
  const favoriteRows = favorites.data?.pages.flatMap(page => page.items) ?? [];
  const collectionRows = collections.data?.pages.flatMap(page => page.items) ?? [];
  return <section className="wk-lib-dashboard">
    <SectionHeading title="Your library" description="Pictures, documents, and video links, kept in one private place."><div className="wk-lib-actions">
      <Button variant="secondary" onClick={() => act({ type: 'video' })}><Video size={16} aria-hidden="true" /> Save video link</Button>
      <Button disabled={!uploadsAvailable} onClick={() => act({ type: 'upload' })}><Upload size={16} aria-hidden="true" /> {uploadsAvailable ? 'Upload' : 'Uploads unavailable'}</Button></div></SectionHeading>
    {capabilities.data?.storageAvailable === false && <p className="wk-lib-storage-status" role="status">File storage is temporarily unavailable. Try again later. Video links, folders, and collections can be saved.</p>}
    <LibraryState error={capabilities.error} retry={() => void capabilities.refetch()} />
    <LibraryState pending={summary.isPending} error={summary.error} retry={() => void summary.refetch()} />
    {summary.data && <div className="wk-lib-category-grid">{(['picture', 'document', 'video'] as const).map(category => {
      const Icon = category === 'picture' ? Image : category === 'document' ? FileText : Video;
      return <button key={category} {...drop.handlers(category)} className={drop.target === category ? 'wk-lib-drop-active' : undefined} onClick={() => navigate(categoryPath[category])}><Icon size={20} aria-hidden="true" /><span><strong>{categoryNames[category]}</strong><small>{summary.data.categories.find(row => row.category === category)?.itemCount ?? 0} items{category === 'document' ? ' · Includes code files' : ''}</small></span></button>;
    })}</div>}
    <div className="wk-lib-dashboard-main">
      {rows.length > 0 && <section className="wk-lib-dashboard-section">
      <SectionHeading title="Pick up where you left off"><Button variant="quiet" onClick={() => navigate(libraryDashboardPath('', true))}>View all recent →</Button></SectionHeading>
      <div className="wk-lib-grid wk-lib-recent-grid">{featured.map(item => <ItemCard key={item.id} item={item} ids={rows.map(row => row.id)} />)}</div>
      </section>}
      <LibraryState pending={recent.isPending} error={recent.error} retry={() => void recent.refetch()} empty={!recent.isPending && !recent.isError && !rows.length} title="Start your library"><p>Upload a file or save a video link above. Use Pictures, Documents, and Videos to organize what you keep.</p></LibraryState>
      <LibraryState error={favorites.error} retry={() => void favorites.refetch()} />
      {favoriteRows.length > 0 && <section className="wk-lib-dashboard-section">
      <SectionHeading title="Favorites"><Button variant="quiet" onClick={() => navigate('/library/favorites')}>View favorites →</Button></SectionHeading>
      <div className="wk-lib-compact-grid">{favoriteRows.map(item => <button key={item.id} onClick={() => open(item.id)}><ItemIcon item={item} /><span><strong>{item.name}</strong><small>{categoryNames[item.category]}</small></span></button>)}</div>
      </section>}
      <LibraryState error={collections.error} retry={() => void collections.refetch()} />
      {collectionRows.length > 0 && <section className="wk-lib-dashboard-section">
      <SectionHeading title="Your collections"><Button variant="quiet" onClick={() => navigate('/library/collections')}>View collections →</Button></SectionHeading>
      <div className="wk-lib-compact-grid">{collectionRows.slice(0, 2).map(collection => <button key={collection.id} onClick={() => openCollection ? openCollection(collection.id) : navigate('/library/collections')}><Folder size={20} aria-hidden="true" /><span><strong>{collection.name}</strong><small>{collection.itemCount} items · Mixed media</small></span></button>)}</div>
      </section>}
    </div>
  </section>;
}
