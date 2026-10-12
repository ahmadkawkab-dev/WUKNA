import { Button } from '../../../components/ui/Button';
import { useLibrarySummary, useStoragePlans } from '../hooks/useLibraryQueries';
import { formatLibraryBytes, StorageMeter } from '../components/StorageMeter';
import { LibraryState, SectionHeading, useLibraryUI } from '../components/LibraryUI';
import { LibraryBrowse } from './LibraryBrowse';

export function LibraryStorage() {
  const summary = useLibrarySummary(); const { navigate } = useLibraryUI(); const storage = summary.data?.storage;
  const plans = useStoragePlans();
  const percent = storage ? Math.round((storage.usedBytes + storage.reservedBytes) / storage.quotaBytes * 100) : 0;
  return <section className="wk-lib-storage-page"><SectionHeading title="Account storage" description="Items in Trash use storage. Permanently deleted files remain charged until cleanup finishes." />
    <LibraryState pending={summary.isPending} error={summary.error} retry={() => void summary.refetch()} />
    {storage && <>{percent >= 80 && <p className="wk-lib-quota-warning" role="status">You’re using {percent}% of your storage. Review large files to make space.</p>}
      <div className="wk-lib-storage-layout"><div className="wk-lib-panel"><h2>{formatLibraryBytes(storage.usedBytes)} / {formatLibraryBytes(storage.quotaBytes)}</h2><StorageMeter />
        <Button variant="secondary" onClick={() => navigate('/library/trash')}>Review Trash</Button></div>
        <div className="wk-lib-panel"><h2>Storage plans</h2>
          <LibraryState pending={plans.isPending} error={plans.error} retry={() => void plans.refetch()} />
          {plans.data?.map(plan => <p key={plan.id}>{plan.name} · {formatLibraryBytes(plan.quotaBytes)}{plan.id !== 'free' && ' · Coming later'}</p>)}
          <Button variant="secondary" disabled>Paid plans coming later</Button><small>Your privacy settings stay the same.</small></div></div>
    </>}
    <SectionHeading title="Make some space"><span>Largest files first</span></SectionHeading><LibraryBrowse storage />
  </section>;
}
