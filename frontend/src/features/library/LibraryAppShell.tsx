import type { ComponentProps } from 'react';
import { HardDrive } from 'lucide-react';
import { AppShell } from '../../components/navigation/AppShell';
import { Button } from '../../components/ui/Button';
import { LibraryProvider } from './LibraryProvider';
import { StorageMeter } from './components/StorageMeter';
import { LibraryNavigation, LibraryCollectionShortcuts } from './components/LibraryNavigation';
import { libraryRoute } from './libraryRoutes';
import './library.css';

// One account cache serves Library and storage across all workspace routes.
export function LibraryAppShell(props: ComponentProps<typeof AppShell>) {
  return <LibraryProvider accountId={props.user.id}>
      <AppShell {...props} renderLibraryNavigation={navigate => <div className="wk-library-rail">
        <LibraryNavigation section={libraryRoute(window.location.pathname)?.section ?? null} navigate={navigate} />
        <LibraryCollectionShortcuts navigate={navigate} onCollection={id => navigate(`/library/collections?collection=${encodeURIComponent(id)}`)} />
      </div>} renderLibraryStorage={navigate => <div className="wk-sidebar-storage"><StorageMeter compact />
        <Button variant="quiet" size="compact" aria-label="Manage storage" title="Manage storage" onClick={() => navigate('/library/storage')}><HardDrive size={16} aria-hidden="true" /><span>Manage storage →</span></Button></div>} />
  </LibraryProvider>;
}
