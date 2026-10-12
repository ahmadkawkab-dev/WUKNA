import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Field } from '../../../components/ui/Field';
import { libraryErrorMessage } from '../contracts';
import { documentAccept, pictureAccept } from '../files';
import { useLibraryCapabilities, useLibraryCollections, useLibraryFolders, useLibraryItem, useLibraryItems, useLibraryMutation } from '../hooks/useLibraryQueries';
import { categoryNames, LibraryState, PrivateLabel, type LibraryAction, useLibraryUI } from './LibraryUI';
import type { LibraryApi } from '../api/LibraryApi';
import type { LibraryCategory, LibraryFolder } from '../types';

export function folderLabel(folder: LibraryFolder, folders: LibraryFolder[]) {
  const names = [folder.name]; const seen = new Set([folder.id]); let parent = folder.parentId;
  while (parent && !seen.has(parent)) { seen.add(parent); const row = folders.find(value => value.id === parent); if (!row) break; names.unshift(row.name); parent = row.parentId; }
  return names.join(' / ');
}
const titles: Record<LibraryAction['type'], string> = {
  upload: 'Add files', video: 'Save a video link', folder: 'New folder', collection: 'Collection', rename: 'Rename item', metadata: 'Tags & notes',
  organize: 'Organize items', trash: 'Move to Trash', delete: 'Delete permanently', restore: 'Restore items', deleteCollection: 'Delete collection', deleteFolder: 'Delete folder', addCollectionItems: 'Add items to collection',
};
type UploadRow = { file: File; state: 'queued' | 'saving' | 'complete' | 'failed'; error?: string; stage?: 'checking' | 'transferring' | 'confirming' };
export function LibraryActionDialog({ action, onClose }: { action: LibraryAction; onClose: () => void }) {
  const { notify } = useLibraryUI(); const folders = useLibraryFolders(); const collections = useLibraryCollections();
  const capabilities = useLibraryCapabilities();
  const uploadsAvailable = capabilities.data?.storageAvailable === true;
  const allFolders = folders.data?.pages.flatMap(page => page.items) ?? [];
  const allCollections = collections.data?.pages.flatMap(page => page.items) ?? [];
  const [name, setName] = useState(action.type === 'rename' ? action.item.name : action.type === 'collection' ? action.collection?.name ?? '' : '');
  const [description, setDescription] = useState(action.type === 'collection' ? action.collection?.description ?? '' : action.type === 'metadata' ? action.item.description ?? '' : '');
  const [tags, setTags] = useState(action.type === 'metadata' ? action.item.tags?.join(', ') ?? '' : '');
  const [notes, setNotes] = useState(action.type === 'metadata' ? action.item.notes ?? '' : '');
  const detail = useLibraryItem(action.type === 'metadata' ? action.item.id : null);
  useEffect(() => { if (detail.data) setNotes(detail.data.notes ?? ''); }, [detail.data?.notes]);
  const [folderId, setFolderId] = useState('folderId' in action ? action.folderId ?? '' : 'parentId' in action ? action.parentId ?? '' : '');
  const [collectionId, setCollectionId] = useState('collectionId' in action ? action.collectionId : '');
  const [target, setTarget] = useState<'folder' | 'collection'>('folder');
  const [url, setUrl] = useState(''); const [error, setError] = useState('');
  const [uploads, setUploads] = useState<UploadRow[]>([]); const [uploading, setUploading] = useState(false); const stop = useRef(false);
  const activeUpload = useRef<AbortController | null>(null);
  useEffect(() => () => { stop.current = true; activeUpload.current?.abort(); }, []);
  const [selected, setSelected] = useState<string[]>([]);
  const candidates = useLibraryItems({ limit: 24 }, action.type === 'addCollectionItems');
  const mutation = useLibraryMutation<(api: LibraryApi, signal: AbortSignal) => Promise<unknown>, unknown>((api, operation, signal) => operation(api, signal));
  const busy = mutation.isPending || uploading;
  const category: LibraryCategory | undefined = 'category' in action ? action.category : action.type === 'video' ? 'video' : undefined;
  const chooseFolder = <label className="wk-lib-field">{action.type === 'folder' ? 'Parent folder' : 'Folder'}<select aria-label={action.type === 'folder' ? 'Parent folder' : 'Folder'} value={folderId} onChange={event => setFolderId(event.target.value)} disabled={folders.isPending || folders.isError || busy}>
    <option value="">All {category ? categoryNames[category].toLowerCase() : 'items'} / root</option>
    {allFolders.filter(folder => folder.category === category).map(folder => <option key={folder.id} value={folder.id}>{folderLabel(folder, allFolders)}</option>)}
  </select></label>;
  const save = async (operation: (api: LibraryApi, signal: AbortSignal) => Promise<unknown>, message: string) => {
    setError('');
    try { await mutation.mutateAsync(operation); notify(message); onClose(); }
    catch (failure) { setError(libraryErrorMessage(failure)); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (action.type === 'upload') { void upload(); return; }
    if (action.type === 'folder') void save((api, signal) => api.createFolder({ name, category: action.category, parentId: folderId || null }, signal), 'Folder created.');
    if (action.type === 'collection') void save((api, signal) => action.collection ? api.updateCollection(action.collection.id, { name, description: description || null }, signal) : api.createCollection({ name, description: description || null }, signal), 'Collection saved.');
    if (action.type === 'video') void save((api, signal) => api.addVideo({ name, description: description || null, folderId: folderId || null, url }, signal), 'Video link saved.');
    if (action.type === 'rename') void save((api, signal) => api.updateItems([action.item.id], { name }, signal), 'Item renamed.');
    if (action.type === 'metadata') void save((api, signal) => api.updateItems([action.item.id], { description: description || null, tags: tags.split(',').map(tag => tag.trim()).filter(Boolean), notes }, signal), 'Tags and notes updated.');
    if (action.type === 'organize') void save((api, signal) => target === 'collection' ? api.collectionItems(collectionId, action.ids, 'add', signal) : api.updateItems(action.ids, { folderId: folderId || null }, signal), 'Items organized.');
    if (action.type === 'addCollectionItems') void save((api, signal) => api.collectionItems(action.collectionId, selected, 'add', signal), 'Items added to the collection.');
    if (action.type === 'trash') void save((api, signal) => api.trashItems(action.ids, signal), 'Moved to Trash. You can restore these items.');
    if (action.type === 'restore') void save((api, signal) => api.restoreItems(action.ids, signal), 'Items restored.');
    if (action.type === 'delete') void save((api, signal) => api.deleteItems(action.ids, signal), 'Items permanently deleted. File cleanup may still be pending.');
    if (action.type === 'deleteCollection') void save((api, signal) => api.deleteCollection(action.collection.id, signal), 'Collection deleted. Its original items are still in Library.');
    if (action.type === 'deleteFolder') void save((api, signal) => api.deleteFolder(action.id, signal), 'Empty folder deleted.');
  };
  const chooseFiles = (files: File[]) => {
    setError(''); if (files.length > 10) { setError('Add up to 10 files at a time.'); return; }
    setUploads(files.map(file => ({ file, state: 'queued' })));
  };
  const upload = async () => {
    if (action.type !== 'upload' || !uploadsAvailable) return;
    setUploading(true); setError(''); stop.current = false; let complete = 0;
    for (let index = 0; index < uploads.length; index++) {
      if (stop.current) break;
      if (uploads[index].state === 'complete') continue;
      const file = uploads[index].file;
      const controller = new AbortController(); activeUpload.current = controller;
      setUploads(rows => rows.map((row, i) => i === index ? { ...row, state: 'saving', error: undefined } : row));
      try { await mutation.mutateAsync((api, signal) => api.addFile({ file, category: action.category, folderId: folderId || null,
        onProgress: stage => setUploads(rows => rows.map((row, i) => i === index ? { ...row, stage } : row)) },
        AbortSignal.any([signal, controller.signal])));
        complete++; setUploads(rows => rows.map((row, i) => i === index ? { ...row, state: 'complete' } : row)); }
      catch (failure) { setUploads(rows => rows.map((row, i) => i === index ? { ...row, state: 'failed', error: controller.signal.aborted ? 'Upload cancelled. Retry to check its saved status or start again.' : libraryErrorMessage(failure) } : row)); }
      finally { activeUpload.current = null; }
    }
    setUploading(false); if (complete) notify(`${complete} file${complete === 1 ? '' : 's'} saved to Library.`);
  };
  const destructive = ['delete', 'deleteCollection', 'deleteFolder'].includes(action.type);
  const requiresName = ['folder', 'collection', 'rename', 'video'].includes(action.type);
  const confirmDisabled = action.type === 'upload' ? !uploadsAvailable || !uploads.some(row => row.state !== 'complete') || folders.isPending || folders.isError :
    action.type === 'organize' ? target === 'collection' ? !collectionId || collections.isError || collections.isPending : !category || folders.isError || folders.isPending :
      action.type === 'addCollectionItems' ? !selected.length : false;
  return <Dialog title={titles[action.type]} onClose={onClose} busy={busy} urgent={destructive} className="wk-lib-action-dialog">
    <form onSubmit={submit} className="wk-lib-form">
      <PrivateLabel />
      {requiresName && <Field label={action.type === 'video' ? 'Title' : 'Name'} required maxLength={160} value={name} onChange={event => setName(event.target.value)} autoFocus disabled={busy} />}
      {action.type === 'video' && <Field label="Video URL" type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…" hint="YouTube, Vimeo, or another HTTPS video link. No video files are uploaded." disabled={busy} />}
      {['collection', 'video', 'metadata'].includes(action.type) && <label className="wk-lib-field">Description<textarea aria-label="Description" maxLength={2000} rows={3} value={description} onChange={event => setDescription(event.target.value)} disabled={busy} /></label>}
      {action.type === 'metadata' && <><Field label="Tags" hint="Separate tags with commas. Up to 12 tags." value={tags} maxLength={500} onChange={event => setTags(event.target.value)} disabled={busy} />
        <LibraryState error={detail.error} retry={() => void detail.refetch()} />
        <label className="wk-lib-field">Personal note<textarea aria-label="Personal note" rows={3} maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)} disabled={busy || detail.isPending || detail.isError} /></label></>}
      {action.type === 'organize' && <fieldset className="wk-lib-field"><legend>Destination</legend>
        <label><input type="radio" name="destination" checked={target === 'folder'} disabled={!category || busy} onChange={() => setTarget('folder')} /> Move to folder{!category && ' (select one file category)'}</label>
        <label><input type="radio" name="destination" checked={target === 'collection'} disabled={busy} onChange={() => setTarget('collection')} /> Add to collection</label></fieldset>}
      {['upload', 'folder', 'video'].includes(action.type) || action.type === 'organize' && target === 'folder' ? <>{chooseFolder}
        {folders.isError && <p role="alert">Could not load folders. <Button variant="quiet" onClick={() => void folders.refetch()}>Retry folders</Button></p>}
        {folders.hasNextPage && <Button variant="quiet" loading={folders.isFetchingNextPage} onClick={() => void folders.fetchNextPage()}>Load more folders</Button>}</> : null}
      {action.type === 'organize' && target === 'collection' && <><label className="wk-lib-field">Collection<select aria-label="Collection" value={collectionId} onChange={event => setCollectionId(event.target.value)} disabled={busy}>
        <option value="">Choose a collection</option>{allCollections.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <LibraryState pending={collections.isPending} error={collections.error} retry={() => void collections.refetch()} empty={!allCollections.length && !collections.isPending} title="Create a collection first" />
        {collections.hasNextPage && <Button variant="quiet" loading={collections.isFetchingNextPage} onClick={() => void collections.fetchNextPage()}>Load more collections</Button>}</>}
      {action.type === 'upload' && <><LibraryState pending={capabilities.isPending} error={capabilities.error} retry={() => void capabilities.refetch()} />
        {!uploadsAvailable && !capabilities.isPending && <p role="status">File storage is unavailable. Try again later.</p>}
        <label className="wk-lib-dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && uploadsAvailable) chooseFiles(Array.from(event.dataTransfer.files)); }}>
        <strong>Drop files here or choose files</strong><span>{action.category === 'picture' ? 'JPG, PNG, WebP' : 'PDF, DOCX, XLSX, Markdown, code & text'} · Up to 20 MB per file</span>
        <input aria-label="Choose Library files" type="file" multiple disabled={busy || !uploadsAvailable} accept={action.category === 'picture' ? pictureAccept : documentAccept} onChange={event => { chooseFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
        <p>Code and text files: up to 256 KB. Files become available after validation and security checks.</p>
        <ul className="wk-lib-upload-queue" aria-live="polite">{uploads.map((row, index) => <li key={`${index}-${row.file.name}`}><strong>{row.file.name}</strong><span>{row.state === 'saving' ? row.stage === 'checking' ? 'Checking file…' : row.stage === 'confirming' ? 'Confirming saved file…' : 'Uploading and checking…' : row.state === 'complete' ? 'Added' : row.state === 'failed' ? row.error : 'Queued'}</span>{row.state === 'saving' && <progress aria-label={`Uploading ${row.file.name}`} />}</li>)}</ul>
        {uploading && <Button variant="secondary" onClick={() => { stop.current = true; activeUpload.current?.abort(); }}>Cancel remaining</Button>}</>}
      {action.type === 'addCollectionItems' && <><LibraryState pending={candidates.isPending} error={candidates.error} retry={() => void candidates.refetch()} empty={candidates.data?.pages[0].items.length === 0} />
        <div className="wk-lib-choices">{candidates.data?.pages.flatMap(page => page.items).map(item => <label key={item.id}><input type="checkbox" disabled={busy || !selected.includes(item.id) && selected.length >= 100} checked={selected.includes(item.id)} onChange={() => setSelected(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : ids.length < 100 ? [...ids, item.id] : ids)} />{item.name}</label>)}</div>
        {candidates.hasNextPage && <Button variant="quiet" loading={candidates.isFetchingNextPage} onClick={() => void candidates.fetchNextPage()}>Load more items</Button>}</>}
      {action.type === 'trash' && <p>Move {action.ids.length} item(s) to Trash? You can restore them later. Items in Trash continue to use storage.</p>}
      {action.type === 'restore' && <p>Restore {action.ids.length} item(s) to their original folders and collections?</p>}
      {action.type === 'delete' && <p>Delete {action.ids.length} item(s) permanently? They will be removed from all collections. This cannot be undone. File storage is released after cleanup finishes.</p>}
      {action.type === 'deleteCollection' && <p>Delete “{action.collection.name}”? The original files remain in their folders.</p>}
      {action.type === 'deleteFolder' && <p>Delete the empty folder “{action.name}”? Move any files or subfolders out first.</p>}
      {error && <p className="wk-alert" role="alert">{error}</p>}
      <div className="wk-dialog-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>{action.type === 'upload' ? 'Done' : 'Cancel'}</Button>
        <Button type="submit" variant={destructive ? 'danger' : 'primary'} loading={busy} disabled={confirmDisabled || action.type === 'metadata' && (detail.isPending || detail.isError)}>{action.type === 'upload' ? !uploadsAvailable ? 'Uploads unavailable' : uploads.some(row => row.state === 'failed') ? 'Retry remaining files' : 'Upload files' : destructive ? 'Delete' : 'Save'}</Button></div>
    </form>
  </Dialog>;
}
