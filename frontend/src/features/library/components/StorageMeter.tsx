import { useId } from 'react';
import { Button } from '../../../components/ui/Button';
import { LoadingSkeleton } from '../../../components/ui/LoadingSkeleton';
import { libraryErrorMessage } from '../contracts';
import { useLibrarySummary } from '../hooks/useLibraryQueries';

export function formatLibraryBytes(bytes: number) {
  return bytes >= 1_000_000_000_000 ? `${(bytes / 1_000_000_000_000).toFixed(1)} TB` : bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : bytes >= 1000 ? `${Math.round(bytes / 1000)} KB` : `${bytes.toLocaleString()} bytes`;
}
export function StorageMeter({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const summary = useLibrarySummary();
  if (summary.isPending) return <div className="wk-library-storage"><LoadingSkeleton label="Loading storage usage" layout="form" /></div>;
  if (summary.isError) return <div className="wk-library-storage"><p role="alert">{libraryErrorMessage(summary.error)}</p>
    <Button variant="secondary" size="compact" loading={summary.isFetching} onClick={() => void summary.refetch()}>Retry storage</Button></div>;
  const { quotaBytes, usedBytes, reservedBytes, availableBytes } = summary.data.storage;
  return <section className="wk-library-storage" aria-label="Storage usage">
    <div className="wk-library-storage-heading"><label htmlFor={id}>Storage</label>{compact && <small>{Math.round((usedBytes + reservedBytes) / quotaBytes * 1000) / 10}%</small>}</div>
    <progress id={id} max={quotaBytes} value={Math.min(quotaBytes, usedBytes + reservedBytes)} />
    <p>{formatLibraryBytes(usedBytes)} used of {formatLibraryBytes(quotaBytes)}</p>
    {!compact && <small>{formatLibraryBytes(availableBytes)} available{reservedBytes > 0 ? ` · ${formatLibraryBytes(reservedBytes)} reserved` : ''}</small>}
    <small>{compact ? 'Only you' : 'Includes Trash and pending file cleanup. Quotas are enforced by the server.'}</small>
  </section>;
}
