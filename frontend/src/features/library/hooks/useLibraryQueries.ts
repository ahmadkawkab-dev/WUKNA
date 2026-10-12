import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLibraryApi } from '../LibraryProvider';
import type { LibraryItemQuery } from '../contracts';
import type { LibraryApi } from '../api/LibraryApi';
import { useEffect, useRef } from 'react';

export function useLibraryCapabilities() {
  const { accountId, api } = useLibraryApi();
  return useQuery({ queryKey: ['library', accountId, 'capabilities'], queryFn: ({ signal }) => api.capabilities(signal) });
}

export function useLibrarySummary() {
  const { accountId, api } = useLibraryApi();
  return useQuery({ queryKey: ['library', accountId, 'summary'], queryFn: ({ signal }) => api.summary(signal) });
}
export function useStoragePlans() {
  const { accountId, api } = useLibraryApi();
  return useQuery({ queryKey: ['library', accountId, 'storage-plans'], queryFn: ({ signal }) => api.storagePlans(signal) });
}
export function useLibraryFolders() {
  const { accountId, api } = useLibraryApi(); const client = useQueryClient();
  const queryKey = ['library', accountId, 'folders'];
  const result = useInfiniteQuery({ queryKey, initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) => api.folders({ cursor: pageParam, limit: 100 }, signal), getNextPageParam: page => page.nextCursor ?? undefined });
  return { ...result, refetch: () => client.resetQueries({ queryKey, exact: true }) };
}
export function useLibraryCollections() {
  const { accountId, api } = useLibraryApi(); const client = useQueryClient();
  const queryKey = ['library', accountId, 'collections'];
  const result = useInfiniteQuery({ queryKey, initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) => api.collections(pageParam, 100, signal), getNextPageParam: page => page.nextCursor ?? undefined });
  return { ...result, refetch: () => client.resetQueries({ queryKey, exact: true }) };
}
export function useLibraryMutation<T, R = void>(operation: (api: LibraryApi, input: T, signal: AbortSignal) => Promise<R>) {
  const { accountId, api } = useLibraryApi(); const client = useQueryClient();
  const pending = useRef(new Set<AbortController>());
  useEffect(() => () => { pending.current.forEach(controller => controller.abort()); pending.current.clear(); }, []);
  return useMutation({ mutationFn: async (input: T) => {
    const controller = new AbortController(); pending.current.add(controller);
    try { return await operation(api, input, controller.signal); }
    finally { pending.current.delete(controller); }
  },
    onSuccess: async () => {
      // Mutations invalidate opaque pagination cursors. Restart lists at page one.
      await client.cancelQueries({ queryKey: ['library', accountId] });
      await Promise.all([
        client.resetQueries({ queryKey: ['library', accountId, 'items'] }),
        client.resetQueries({ queryKey: ['library', accountId, 'folders'] }),
        client.resetQueries({ queryKey: ['library', accountId, 'collections'] }),
      ]);
      await client.invalidateQueries({ queryKey: ['library', accountId],
        predicate: query => !['items', 'folders', 'collections'].includes(String(query.queryKey[2])) });
    } });
}
export function useLibraryItem(id: string | null) {
  const { accountId, api } = useLibraryApi();
  return useQuery({ queryKey: ['library', accountId, 'item', id], enabled: id !== null,
    queryFn: ({ signal }) => api.item(id!, signal) });
}
export function useLibraryItems(query: Omit<LibraryItemQuery, 'cursor'>, enabled = true) {
  const { accountId, api } = useLibraryApi(); const client = useQueryClient();
  const queryKey = ['library', accountId, 'items', query];
  const result = useInfiniteQuery({
    queryKey, enabled, initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) => api.items({ ...query, cursor: pageParam }, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
  return { ...result, refetch: () => client.resetQueries({ queryKey, exact: true }) };
}
