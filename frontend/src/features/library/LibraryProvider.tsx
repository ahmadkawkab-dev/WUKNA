import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LibraryApi } from './api/LibraryApi';
import { createHttpLibraryApi } from './api/createHttpLibraryApi';
import { createPictureThumbnailCache } from './pictureThumbnailCache';
import { currentSession } from '../../auth';
import { LibraryApiError } from './contracts';

const LibraryContext = createContext<{ accountId: string; api: LibraryApi; picturePreviews: ReturnType<typeof createPictureThumbnailCache> } | null>(null);
type ProviderProps = { accountId: string; children: ReactNode; createApi?: (accountId: string) => LibraryApi };

/** A changed account gets an entirely new adapter and query cache. */
export function LibraryProvider(props: ProviderProps) {
  return <AccountLibraryProvider key={props.accountId} {...props} />;
}
function AccountLibraryProvider({ accountId, children, createApi }: ProviderProps) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: {
    staleTime: 30_000, gcTime: 120_000, retry: false, refetchOnWindowFocus: false,
  } } }));
  const [context] = useState(() => {
    const source = createApi?.(accountId) ?? createHttpLibraryApi(accountId);
    const picturePreviews = createPictureThumbnailCache(accountId, (id, signal) => source.thumbnail(id, signal), () => {
      if (!createApi && currentSession()?.user.id !== accountId) throw new LibraryApiError('account_changed', 401);
    });
    const removePreviews = async (ids: string[], operation: () => Promise<void>) => {
      await operation(); await picturePreviews.forget(ids);
      client.removeQueries({ queryKey: ['library', accountId, 'blob'], predicate: query => ids.includes(String(query.queryKey[4])) });
    };
    const api: LibraryApi = { ...source,
      trashItems: (ids, signal) => removePreviews(ids, () => source.trashItems(ids, signal)),
      deleteItems: (ids, signal) => removePreviews(ids, () => source.deleteItems(ids, signal)),
    };
    return { accountId, api, picturePreviews };
  });
  const lifecycle = useRef(0);
  useEffect(() => { void context.picturePreviews.prepare(); }, [context]);
  useEffect(() => {
    const generation = ++lifecycle.current;
    return () => {
      // StrictMode immediately replays effects on the same instance. Only clear on a real
      // teardown, after child observers have detached and scheduled their cache cleanup.
      queueMicrotask(() => {
        if (lifecycle.current !== generation) return;
        void client.cancelQueries().then(() => {
          if (lifecycle.current === generation) { client.clear(); context.picturePreviews.dispose(); context.api.dispose?.(); }
        });
      });
    };
  }, [client, context]);
  useEffect(() => {
    const refresh = () => {
      // A cursor may expire while the tab is hidden. Restart lists rather than
      // refetching their later pages with stale cursors.
      void client.cancelQueries({ queryKey: ['library', accountId], predicate: query => query.queryKey[2] !== 'blob' || query.queryKey[3] !== 'thumbnail' }).then(async () => {
        await Promise.all(['items', 'folders', 'collections'].map(resource =>
          client.resetQueries({ queryKey: ['library', accountId, resource] })));
        await client.invalidateQueries({ queryKey: ['library', accountId],
          predicate: query => !['items', 'folders', 'collections'].includes(String(query.queryKey[2])) &&
            !(query.queryKey[2] === 'blob' && query.queryKey[3] === 'thumbnail') });
      });
    };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [client, accountId]);
  return <LibraryContext.Provider value={context}><QueryClientProvider client={client}>{children}</QueryClientProvider></LibraryContext.Provider>;
}
export function useLibraryApi() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('Library hooks require LibraryProvider.');
  return context;
}
export const useOptionalLibraryApi = () => useContext(LibraryContext);
