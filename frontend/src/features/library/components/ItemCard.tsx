import { useEffect, useRef, useState } from 'react';
import { Heart, MoreHorizontal } from 'lucide-react';
import { Button, IconButton } from '../../../components/ui/Button';
import { useLibraryMutation } from '../hooks/useLibraryQueries';
import { formatLibraryBytes } from './StorageMeter';
import { fileType, ItemIcon, libraryDate, useLibraryUI } from './LibraryUI';
import type { LibraryItemSummary } from '../types';
import { libraryErrorMessage } from '../contracts';
import { LibraryThumbnail } from './LibraryThumbnail';

export function ItemActions({ item }: { item: LibraryItemSummary }) {
  const { act } = useLibraryUI(); const ref = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: Event) => { if (event.type === 'pointerdown' && ref.current?.contains(event.target as Node)) return; if (ref.current) ref.current.open = false; };
    document.addEventListener('pointerdown', close); window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [expanded]);
  const invoke = (action: Parameters<typeof act>[0]) => { if (ref.current) ref.current.open = false; act(action); };
  return <details ref={ref} className="wk-lib-item-menu" onToggle={() => {
    setExpanded(ref.current?.open ?? false);
    const menu = ref.current?.querySelector<HTMLElement>('div'); const anchor = ref.current?.querySelector('summary');
    if (!menu || !anchor || !ref.current?.open) return;
    const rect = anchor.getBoundingClientRect(); const bounds = menu.getBoundingClientRect(); const gutter = parseFloat(getComputedStyle(document.documentElement).fontSize) / 2;
    menu.style.left = `${Math.max(gutter, Math.min(innerWidth - bounds.width - gutter, rect.right - bounds.width))}px`;
    menu.style.top = `${Math.max(gutter, Math.min(innerHeight - bounds.height - gutter, rect.bottom))}px`;
  }} onKeyDown={event => { if (event.key === 'Escape' && ref.current) { ref.current.open = false; ref.current.querySelector('summary')?.focus(); } }}
    onBlur={event => { if (ref.current && !event.currentTarget.contains(event.relatedTarget as Node | null)) ref.current.open = false; }}>
    <summary aria-label={`Actions for ${item.name}`} title={`Actions for ${item.name}`}><MoreHorizontal size={18} aria-hidden="true" /></summary>
    <div>{item.deletedAt ? <><Button variant="quiet" onClick={() => invoke({ type: 'restore', ids: [item.id] })}>Restore</Button>
      <Button variant="danger" onClick={() => invoke({ type: 'delete', ids: [item.id] })}>Delete permanently</Button></> : <>
      <Button variant="quiet" onClick={() => invoke({ type: 'rename', item })}>Rename</Button>
      <Button variant="quiet" onClick={() => invoke({ type: 'metadata', item })}>Tags &amp; notes</Button>
      <Button variant="quiet" onClick={() => invoke({ type: 'organize', ids: [item.id], category: item.category })}>Organize</Button>
      <Button variant="quiet" onClick={() => invoke({ type: 'trash', ids: [item.id] })}>Move to Trash</Button></>}
    </div>
  </details>;
}
export function FavoriteButton({ item }: { item: LibraryItemSummary }) {
  const { notify } = useLibraryUI();
  const mutation = useLibraryMutation<boolean>((api, favorite, signal) => api.updateItems([item.id], { favorite }, signal));
  return <IconButton label={`${item.favorite ? 'Remove' : 'Add'} ${item.name} ${item.favorite ? 'from' : 'to'} favorites`} aria-pressed={item.favorite} disabled={mutation.isPending}
    onClick={() => mutation.mutate(!item.favorite, { onError: error => notify(libraryErrorMessage(error)) })}>
    <Heart size={17} fill={item.favorite ? 'currentColor' : 'none'} aria-hidden="true" /></IconButton>;
}
export function ItemCard({ item, selected, onSelect, ids }: { item: LibraryItemSummary; selected?: boolean; onSelect?: () => void; ids?: string[] }) {
  const { open } = useLibraryUI();
  return <article className={`wk-lib-card${selected ? ' wk-lib-card--selected' : ''}`}>
    <button className={`wk-lib-card-preview wk-lib-card-preview--${item.category}`} onClick={() => open(item.id, ids)} aria-label={`Open ${item.name}`}>
      {item.thumbnailReference ? <LibraryThumbnail item={item} /> : <><ItemIcon item={item} size={28} />
        <span>{fileType(item)}</span>{item.description && <small>{item.description}</small>}</>}
      {item.category === 'video' && <span className="wk-lib-video-label">Video link</span>}
    </button>
    {onSelect && <label className="wk-lib-select"><input type="checkbox" checked={selected ?? false} onChange={onSelect} aria-label={`Select ${item.name}`} /></label>}
    <div className="wk-lib-card-copy"><button className="wk-lib-name" title={item.name} onClick={() => open(item.id, ids)}>{item.name}</button><ItemActions item={item} />
      <small>{fileType(item)} · {formatLibraryBytes(item.sizeBytes)}</small><small>Added {libraryDate(item.createdAt)}</small>
      {!item.deletedAt && <FavoriteButton item={item} />}
    </div>
  </article>;
}
