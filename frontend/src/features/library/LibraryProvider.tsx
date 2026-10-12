import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LibraryApi } from './api/LibraryApi';
import { createHttpLibraryApi } from './api/createHttpLibraryApi';

const LibraryContext = createContext<{ accountId: string; api: LibraryApi } | null>(null);
type ProviderProps = { accountId: string; children: ReactNode; createApi?: (accountId: string) => LibraryApi };

/** A changed account gets an entirely new adapter and query cache. */
export function LibraryProvider(props: ProviderProps) {
  return <AccountLibraryProvider key={props.accountId} {...props} />;
}
function AccountLibraryProvider({ accountId, children, createApi }: ProviderProps) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: {
    staleTime: 30_000, gcTime: 120_000, retry: false, refetchOnWindowFocus: false,
  } } }));
  const [context] = useState(() => ({ accountId, api: createApi?.(accountId) ?? createHttpLibraryApi(accountId) }));
  const lifecycle = useRef(0);
  useEffect(() => {
    const generation = ++lifecycle.current;
    return () => {
      // StrictMode immediately replays effects on the same instance. Only clear on a real
      // teardown, after child observers have detached and scheduled their cache cleanup.
      queueMicrotask(() => {
        if (lifecycle.current !== generation) return;
        void client.cancelQueries().then(() => {
          if (lifecycle.current === generation) { client.clear(); context.api.dispose?.(); }
        });
      });
    };
  }, [client, context.api]);
  useEffect(() => {
    const refresh = () => {
      // A cursor may expire while the tab is hidden. Restart lists rather than
      // refetching their later pages with stale cursors.
      void client.cancelQueries({ queryKey: ['library', accountId] }).then(async () => {
        await Promise.all(['items', 'folders', 'collections'].map(resource =>
          client.resetQueries({ queryKey: ['library', accountId, resource] })));
        await client.invalidateQueries({ queryKey: ['library', accountId],
          predicate: query => !['items', 'folders', 'collections'].includes(String(query.queryKey[2])) });
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
