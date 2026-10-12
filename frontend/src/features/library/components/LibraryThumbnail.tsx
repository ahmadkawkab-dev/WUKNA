import { useLibraryBlob } from '../hooks/useLibraryBlob';
import type { LibraryItemSummary } from '../types';
import { ItemIcon } from './LibraryUI';

export function LibraryThumbnail({ item }: { item: LibraryItemSummary }) {
  const { url } = useLibraryBlob(item.id, 'thumbnail', item.thumbnailReference);
  return url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <ItemIcon item={item} />;
}
