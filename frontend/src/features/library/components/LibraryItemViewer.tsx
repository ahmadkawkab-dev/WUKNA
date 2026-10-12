import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Expand, ExternalLink, Minus, Plus } from 'lucide-react';
import { Button, IconButton } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { LoadingSkeleton } from '../../../components/ui/LoadingSkeleton';
import { useLibraryCapabilities, useLibraryFolders, useLibraryItem } from '../hooks/useLibraryQueries';
import { formatLibraryBytes } from './StorageMeter';
import { FavoriteButton } from './ItemCard';
import { categoryNames, LibraryState, PrivateLabel, useLibraryUI } from './LibraryUI';
import { useLibraryBlob } from '../hooks/useLibraryBlob';
import { libraryErrorMessage } from '../contracts';
import { folderLabel } from './LibraryActionDialog';
const CodeViewer = lazy(() => import('../documents/CodeDocumentViewer').then(module => ({ default: module.CodeDocumentViewer })));

export function LibraryItemViewer({ id, ids, onChange, onClose }: { id: string; ids: string[]; onChange: (id: string) => void; onClose: () => void }) {
  const item = useLibraryItem(id); const folders = useLibraryFolders(); const { act, notify } = useLibraryUI();
  const [zoom, setZoom] = useState(1); const [play, setPlay] = useState(false); const image = useRef<HTMLDivElement>(null);
  const index = ids.indexOf(id); const detail = item.data;
  const capabilities = useLibraryCapabilities();
  const content = useLibraryBlob(id, 'content', detail?.contentReference);
  const thumbnail = useLibraryBlob(id, 'thumbnail', detail?.thumbnailReference, detail?.category === 'picture');
  const downloadAvailable = capabilities.data?.storageAvailable === true && detail?.processingStatus === 'available' && Boolean(content.url);
  useEffect(() => { setZoom(1); setPlay(false); }, [id]);
  const browse = (direction: number) => { if (index >= 0 && ids[index + direction]) onChange(ids[index + direction]); };
  const download = () => {
    if (!detail) return;
    const url = content.url;
    if (!url || !url.startsWith('blob:')) { notify('The original file is currently unavailable.'); return; }
    const link = document.createElement('a'); link.href = url; link.download = detail.name; link.click();
  };
  const embed = detail?.category === 'video' && detail.videoId && (detail.provider === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(detail.videoId) || detail.provider === 'vimeo' && /^\d{1,20}$/.test(detail.videoId)) ? detail.provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${detail.videoId}` :
    detail.provider === 'vimeo' ? `https://player.vimeo.com/video/${detail.videoId}` : null : null;
  return <Dialog title={detail?.name ?? 'Opening item'} onClose={onClose} className="wk-lib-viewer-dialog">
    <div className="wk-lib-viewer" onKeyDown={event => {
      if ((event.target as HTMLElement).closest('input,textarea,select,pre')) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); browse(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); browse(1); }
    }}>
      <LibraryState pending={item.isPending} error={item.error} retry={() => void item.refetch()} />
      {detail && !item.isError && <><div className="wk-lib-toolbar"><PrivateLabel /><div className="wk-lib-actions">
        {!detail.deletedAt && <FavoriteButton item={detail} />}
        {detail.category !== 'video' && <Button variant="secondary" disabled={!downloadAvailable} onClick={download}><Download size={16} aria-hidden="true" /> Download</Button>}
        {!detail.deletedAt && <Button variant="secondary" onClick={() => act({ type: 'organize', ids: [id], category: detail.category })}>Organize</Button>}
      </div></div>
      {detail.category !== 'video' && capabilities.data?.storageAvailable !== true && <p role="status">File storage is temporarily unavailable. Try again later.</p>}
      {content.error && <p role="alert">{libraryErrorMessage(content.error)} <Button variant="quiet" onClick={() => void content.retry()}>Retry file</Button></p>}
      <div className="wk-lib-viewer-layout"><div className="wk-lib-viewer-content">
        {detail.category === 'picture' && <><div ref={image} className="wk-lib-picture-stage">{content.url || thumbnail.url ? <img src={content.url ?? thumbnail.url!} alt={detail.alt} style={{ transform: `scale(${zoom})`, transformOrigin: zoom > 1 ? 'top left' : 'center' }} /> : <p>Original picture unavailable.</p>}</div>
          <div className="wk-lib-zoom"><IconButton label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}><Minus size={16} /></IconButton>
            <span>{Math.round(zoom * 100)}%</span><IconButton label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 0.25))}><Plus size={16} /></IconButton>
            <Button variant="quiet" onClick={() => setZoom(1)}>Fit to screen</Button><Button variant="quiet" onClick={() => { if (image.current?.requestFullscreen) void image.current.requestFullscreen().catch(() => notify('Full screen is unavailable.')); else notify('Full screen is unavailable.'); }}><Expand size={16} /> Full screen</Button></div></>}
        {detail.category === 'document' && <Suspense fallback={<LoadingSkeleton label="Loading document viewer" />}>
          {detail.previewKind === 'code' ? <CodeViewer name={detail.name} language={detail.language} source={detail.source} /> :
            detail.previewKind === 'text' && detail.text !== undefined ? <pre className="wk-lib-text-document" tabIndex={0} aria-label="Document text">{detail.text}</pre> :
              detail.previewKind === 'pdf' && content.url?.startsWith('blob:') ? <><object className="wk-lib-pdf" type="application/pdf" data={content.url} aria-label={`PDF preview for ${detail.name}`}><p>Your browser cannot show this PDF. Use Download to open the file.</p></object><p className="wk-lib-pdf-help">PDF previews use your browser’s viewer. If the page doesn’t appear, use Download to open the file.</p></> :
                <section className="wk-lib-state"><h3>Original file unavailable for preview</h3><p>{content.url ? 'This format can be downloaded and opened in its own application.' : detail.processingStatus !== 'available' ? 'This file is not ready for preview yet.' : 'The original file is currently unavailable.'}</p></section>}
        </Suspense>}
        {detail.category === 'video' && <section className="wk-lib-video-stage">{play && embed ? <iframe src={embed} title={`Video: ${detail.name}`} allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" /> : <>
          {thumbnail.url && <img src={thumbnail.url} alt="" />}<h3>{detail.name}</h3>
          {embed && <><p>Load the player from {detail.provider === 'youtube' ? 'YouTube' : 'Vimeo'} to watch here.</p><Button onClick={() => setPlay(true)}>Load video player</Button></>}
          <a className="wk-lib-link" href={detail.url} target="_blank" rel="noopener noreferrer">Open original video <ExternalLink size={16} aria-hidden="true" /></a></>}
        </section>}
        {ids.length > 1 && <div className="wk-lib-viewer-paging"><Button variant="secondary" disabled={index <= 0} onClick={() => browse(-1)}><ChevronLeft size={16} /> Previous</Button>
          <span>{index + 1} of {ids.length}</span><Button variant="secondary" disabled={index < 0 || index >= ids.length - 1} onClick={() => browse(1)}>Next <ChevronRight size={16} /></Button></div>}
      </div><aside className="wk-lib-details"><h3>Details</h3><PrivateLabel /><dl>
        <dt>Type</dt><dd>{categoryNames[detail.category]}{detail.category === 'document' ? ` · ${detail.asset.contentType}` : ''}</dd>
        <dt>Size</dt><dd>{formatLibraryBytes(detail.sizeBytes)}</dd><dt>Added</dt><dd>{new Date(detail.createdAt).toLocaleDateString()}</dd>
        {detail.description && <><dt>Description</dt><dd>{detail.description}</dd></>}
        <dt>Folder</dt><dd>{detail.folderBreadcrumb?.length ? detail.folderBreadcrumb.map(folder => folder.name).join(' / ') : detail.folderId ? folders.data?.pages.flatMap(page => page.items).filter(folder => folder.id === detail.folderId).map(folder => folderLabel(folder, folders.data!.pages.flatMap(page => page.items))).join('') || 'Loading folder…' : 'Root'}</dd>
        {detail.category === 'video' && <><dt>Provider</dt><dd>{detail.provider}</dd>{detail.creator && <><dt>Creator</dt><dd>{detail.creator}</dd></>}{detail.metadataErrorCode && <><dt>Metadata</dt><dd>Provider details are currently unavailable. Your link is saved.</dd></>}</>}
        {detail.category === 'picture' && <><dt>Dimensions</dt><dd>{detail.width && detail.height ? `${detail.width} × ${detail.height}` : 'Unavailable'}</dd></>}
      </dl><h3>Tags</h3><div className="wk-lib-tags">{detail.tags?.length ? detail.tags.map(tag => <span key={tag}>{tag}</span>) : <small>No tags yet</small>}</div>
        <h3>Personal notes</h3><p className="wk-lib-personal-note">{detail.notes || 'Keep a thought for later.'}</p>
        {!detail.deletedAt && <Button variant="secondary" onClick={() => act({ type: 'metadata', item: detail })}>Edit tags &amp; notes</Button>}
        <p>This item is private. Collections organize your files without sharing them.</p>
      </aside></div></>}
    </div>
  </Dialog>;
}
