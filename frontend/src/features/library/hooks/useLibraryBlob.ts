import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLibraryApi } from '../LibraryProvider';

/** Fetch private references by item ID with bearer auth, never as direct DOM URLs. */
export function useLibraryBlob(id: string, kind: 'content' | 'thumbnail', reference?: string | null) {
  const { accountId, api } = useLibraryApi();
  const query = useQuery({ queryKey: ['library', accountId, 'blob', kind, id, reference],
    enabled: Boolean(reference), gcTime: 30_000,
    queryFn: ({ signal }) => api[kind](id, signal) });
  const identity = `${accountId}:${kind}:${id}:${reference}`;
  const [resource, setResource] = useState<{ identity: string; blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const url = URL.createObjectURL(query.data);
    setResource({ identity, blob: query.data, url });
    return () => URL.revokeObjectURL(url);
  }, [query.data, identity]);
  return { url: resource?.identity === identity && resource.blob === query.data ? resource.url : null,
    pending: Boolean(reference) && query.isPending, error: query.error, retry: query.refetch };
}
