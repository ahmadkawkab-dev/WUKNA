import { LibraryThumbnail } from '../components/LibraryThumbnail';
import { useLibraryCapabilities } from '../hooks/useLibraryQueries';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Folder, Grid2X2, List, Plus, Upload } from 'lucide-react';
import { Button, IconButton } from '../../../components/ui/Button';
import { SearchInput } from '../../../components/ui/SearchInput';
import { useLibraryFolders, useLibraryItems } from '../hooks/useLibraryQueries';
import type { LibraryItemQuery, LibrarySort } from '../contracts';
import { FavoriteButton, ItemActions, ItemCard } from '../components/ItemCard';
import { categoryNames, fileType, ItemIcon, libraryDate, LibraryState, PrivateLabel, SectionHeading, useLibraryUI } from '../components/LibraryUI';
import { formatLibraryBytes } from '../components/StorageMeter';
import type { LibraryCategory } from '../types';
import { folderLabel } from '../components/LibraryActionDialog';
import { useLibraryDrop } from '../hooks/useLibraryDrop';
import { LibraryCaptureHelp } from '../components/LibraryCaptureHelp';

export function LibraryBrowse({ category, favorite = false, trash = false, collectionId, search, storage = false }: {
  category?: LibraryCategory; favorite?: boolean; trash?: boolean; collectionId?: string; search?: string; storage?: boolean;
}) {
  const { act, open } = useLibraryUI(); const folders = useLibraryFolders();
  const [folder, setFolder] = useState<string | undefined>(); const [term, setTerm] = useState('');
  const [captureHelp, setCaptureHelp] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false); const [kind, setKind] = useState<LibraryItemQuery['documentKind']>();
  const [mode, setMode] = useState<'grid' | 'list'>(category === 'document' || trash || search !== undefined || storage ? 'list' : 'grid');
  const [sort, setSort] = useState<LibrarySort>(storage ? 'size-desc' : 'created-desc'); const [selected, setSelected] = useState<string[]>([]);
  const capabilities = useLibraryCapabilities();
  const drop = useLibraryDrop();
  const query = { category, favorite: favorite || onlyFavorites ? true : undefined, trash, collectionId, folderId: folder, search: search ?? term, sort, documentKind: kind, limit: 24 };
  const result = useLibraryItems(query);
  const pagedPictures = category === 'picture';
  const pageKey = JSON.stringify(query);
  const [picturePage, setPicturePage] = useState({ key: pageKey, index: 0 });
  const pages = result.data?.pages ?? [];
  const pageIndex = picturePage.key === pageKey ? Math.min(picturePage.index, Math.max(0, pages.length - 1)) : 0;
  const rows = pagedPictures ? pages[pageIndex]?.items ?? [] : pages.flatMap(page => page.items);
  const nextPicturePage = async () => {
    const nextIndex = pageIndex + 1;
    if (nextIndex >= pages.length) {
      const fetched = await result.fetchNextPage();
      if (fetched.isError || !fetched.data?.pages[nextIndex]) return;
    }
    setSelected([]); setPicturePage({ key: pageKey, index: nextIndex });
  };
  const allFolders = folders.data?.pages.flatMap(page => page.items) ?? [];
  const currentFolder = allFolders.find(row => row.id === folder);
  const children = allFolders.filter(row => row.category === category && row.parentId === (folder ?? null));
  useEffect(() => {
    if (folder && folders.data && !folders.hasNextPage && !folders.isFetching && !currentFolder)
      setFolder(undefined);
  }, [folder, folders.data, folders.hasNextPage, folders.isFetching, currentFolder]);
  useEffect(() => { setSelected([]); }, [category, folder, onlyFavorites, kind, sort, term, search, collectionId]);
  useEffect(() => { if (result.data) { const visible = new Set(result.data.pages.flatMap(page => page.items.map(item => item.id))); setSelected(ids => ids.filter(id => visible.has(id))); } }, [result.data]);
  const toggle = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : ids.length < 100 ? [...ids, id] : ids);
  const selectedRows = rows.filter(row => selected.includes(row.id)); const selectedCategory = selectedRows.length && selectedRows.every(row => row.category === selectedRows[0].category) ? selectedRows[0].category : undefined;
  return <section {...drop.handlers(!trash && search === undefined ? category : undefined, folder)} className={`wk-lib-browse${drop.target ? ' wk-lib-drop-active' : ''}`} aria-label={trash ? 'Trash items' : category ? `${categoryNames[category]} content` : 'Library items'}>
    {!category && !collectionId && search === undefined && !storage && <SectionHeading title={trash ? 'Your Trash' : 'Your favorites'} description={trash ? 'Restore items or permanently delete them to make space.' : 'Keep the items you return to close at hand.'} />}
    {category && !trash && search === undefined && <><SectionHeading title={currentFolder?.name ?? `All ${categoryNames[category]}`} description={category === 'document' ? 'Documents and code files, organized together.' : category === 'picture' ? 'Your saved pictures, organized in folders.' : 'Save video links and organize them in folders.'}>
      <div className="wk-lib-actions">{category === 'video' && <Button variant="secondary" onClick={() => setCaptureHelp(true)}>Save from YouTube</Button>}<Button variant="secondary" onClick={() => act({ type: 'folder', category, parentId: folder ?? null })}><Folder size={16} aria-hidden="true" /> New folder</Button>
        <Button disabled={category !== 'video' && capabilities.data?.storageAvailable !== true} onClick={() => act(category === 'video' ? { type: 'video', folderId: folder } : { type: 'upload', category, folderId: folder })}>{category === 'video' ? <Plus size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}{category === 'video' ? 'Save video link' : capabilities.data?.storageAvailable === true ? 'Upload' : 'Uploads unavailable'}</Button></div></SectionHeading>
      {category !== 'video' && capabilities.data?.storageAvailable === false && <p className="wk-lib-storage-status" role="status">File storage is temporarily unavailable. Try again later.</p>}
      <p className="wk-lib-drop-hint">{category === 'video' ? 'Drop a video link here to save it.' : `Drop ${category === 'picture' ? 'pictures' : 'documents'} here to upload them${currentFolder ? ' into this folder' : ''}.`}</p>
      {currentFolder && <div className="wk-lib-folder-path"><Button variant="quiet" onClick={() => setFolder(undefined)}>All {categoryNames[category]}</Button><span>/</span><Button variant="quiet" onClick={() => setFolder(currentFolder.parentId ?? undefined)}>{folderLabel(currentFolder, allFolders)}</Button></div>}
      {capabilities.isError && <LibraryState error={capabilities.error} retry={() => void capabilities.refetch()} />}
      {folders.isError && <LibraryState error={folders.error} retry={() => void folders.refetch()} />}
      {children.length > 0 && <div className="wk-lib-folder-grid">{children.map(row => <button key={row.id} onClick={() => setFolder(row.id)}><Folder size={20} /><span><strong>{row.name}</strong><small>Open folder</small></span></button>)}</div>}
      {folders.hasNextPage && <Button variant="quiet" loading={folders.isFetchingNextPage} onClick={() => void folders.fetchNextPage()}>Load more folders</Button>}
      {currentFolder && <Button variant="quiet" onClick={() => act({ type: 'deleteFolder', id: currentFolder.id, name: currentFolder.name })}>Delete empty folder</Button>}
    </>}
    <div className="wk-lib-toolbar"><div className="wk-lib-filters">
      {search === undefined && <div className="wk-lib-search-field"><SearchInput aria-label="Filter Library items" clearLabel="Clear Library filter" placeholder="Filter by name, tag, or code…" value={term} onValueChange={setTerm} maxLength={200} /></div>}
      {!trash && !favorite && <Button variant="secondary" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(value => !value)}>Favorites</Button>}
      {category === 'document' && <label className="wk-lib-field"><span className="wk-sr-only">Document type</span><select aria-label="Document type" value={kind ?? ''} onChange={event => setKind((event.target.value || undefined) as typeof kind)}>
        <option value="">All document types</option><option value="pdf">PDF</option><option value="code">Code files</option><option value="text">Text &amp; Markdown</option><option value="unavailable">Office documents</option></select></label>}
    </div><div className="wk-lib-actions"><label className="wk-lib-field"><span className="wk-sr-only">Sort items</span><select aria-label="Sort items" value={sort} onChange={event => setSort(event.target.value as LibrarySort)}>
      <option value="created-desc">Date added</option><option value="updated-desc">Recently updated</option><option value="name-asc">Name</option><option value="size-desc">Largest first</option></select></label>
      <div className="wk-lib-view-switch"><IconButton label="List view" aria-pressed={mode === 'list'} onClick={() => setMode('list')}><List size={18} /></IconButton><IconButton label="Grid view" aria-pressed={mode === 'grid'} onClick={() => setMode('grid')}><Grid2X2 size={18} /></IconButton></div></div>
    </div>
    {selected.length > 0 && <div className="wk-lib-selection"><strong>{selected.length} selected</strong><div className="wk-lib-actions">
      {trash ? <><Button variant="secondary" onClick={() => act({ type: 'restore', ids: selected })}>Restore</Button><Button variant="danger" onClick={() => act({ type: 'delete', ids: selected })}>Delete permanently</Button></> : <>
        <Button variant="secondary" onClick={() => act({ type: 'organize', ids: selected, category: selectedCategory })}>Organize</Button><Button variant="secondary" onClick={() => act({ type: 'trash', ids: selected })}>Move to Trash</Button></>}
      <Button variant="quiet" onClick={() => setSelected([])}>Clear selection</Button></div></div>}
    <LibraryState pending={result.isPending} error={result.error} retry={() => void result.refetch()} empty={!result.isPending && !result.isError && rows.length === 0}
      title={term || search || onlyFavorites || kind ? 'No matches found' : trash ? 'Trash is empty' : favorite ? 'Your favorites will appear here' : 'A little room for inspiration'}>
      <p>{trash ? 'Items you move to Trash can be restored until you delete them permanently.' : 'Try another filter or add something you want to keep.'}</p>
      {(term || onlyFavorites || kind) && <Button variant="secondary" onClick={() => { setTerm(''); setOnlyFavorites(false); setKind(undefined); }}>Clear filters</Button>}
    </LibraryState>
    {!result.isPending && (!result.isError || pagedPictures) && rows.length > 0 && (mode === 'grid' ? <div className="wk-lib-grid">{rows.map(item => <ItemCard key={item.id} item={item} ids={rows.map(row => row.id)} selected={selected.includes(item.id)} onSelect={() => toggle(item.id)} />)}</div> :
      <div className="wk-lib-table-wrap" tabIndex={0} role="region" aria-label="Scrollable file list"><table className="wk-lib-table"><caption className="wk-sr-only">Library items</caption><thead><tr><th scope="col"><input type="checkbox" aria-label="Select all visible items" checked={rows.length > 0 && rows.every(row => selected.includes(row.id))}
        onChange={event => setSelected(event.target.checked ? rows.slice(0, 100).map(row => row.id) : [])} /></th><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Size</th><th scope="col">Date added</th><th scope="col">Visibility</th><th scope="col"><span className="wk-sr-only">Actions</span></th></tr></thead>
        <tbody>{rows.map(item => <tr key={item.id} data-selected={selected.includes(item.id) || undefined}><td><input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td>
          <td><button className="wk-lib-table-name" onClick={() => open(item.id, rows.map(row => row.id))}><LibraryThumbnail item={item} /><span><strong>{item.name}</strong><small>{item.tags?.join(' · ') || (item.folderId ? allFolders.find(folder => folder.id === item.folderId)?.name : 'Root')}</small></span></button></td>
          <td>{fileType(item)}</td><td>{formatLibraryBytes(item.sizeBytes)}</td><td>{libraryDate(item.createdAt)}</td><td><PrivateLabel /></td><td><div className="wk-lib-actions">{!trash && <FavoriteButton item={item} />}<ItemActions item={item} /></div></td></tr>)}</tbody></table></div>)}
    {pagedPictures && pages.length > 0 ? <nav className="wk-lib-pagination" aria-label="Picture pages">
      <Button variant="secondary" disabled={pageIndex === 0 || result.isFetchingNextPage} onClick={() => { setSelected([]); setPicturePage({ key: pageKey, index: pageIndex - 1 }); }}><ChevronLeft size={16} aria-hidden="true" /> Previous</Button>
      <span role="status" aria-live="polite">Page {pageIndex + 1} · Up to 24 pictures</span>
      <Button variant="secondary" disabled={pageIndex + 1 >= pages.length && !result.hasNextPage} loading={result.isFetchingNextPage} onClick={() => void nextPicturePage()}>Next <ChevronRight size={16} aria-hidden="true" /></Button>
    </nav> : result.hasNextPage && <Button variant="secondary" loading={result.isFetchingNextPage} onClick={() => void result.fetchNextPage()}>Load more items</Button>}
    <footer className="wk-lib-footer"><span>{rows.length} item{rows.length === 1 ? '' : 's'}{!pagedPictures && result.hasNextPage ? ' · More available' : ''}</span><PrivateLabel /></footer>
    {captureHelp && <LibraryCaptureHelp onClose={() => setCaptureHelp(false)} />}
  </section>;
}
