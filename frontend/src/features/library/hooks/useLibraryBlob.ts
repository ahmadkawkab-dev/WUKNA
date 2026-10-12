import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLibraryApi } from '../LibraryProvider';
import { LibraryApiError } from '../contracts';

/** Fetch private references by item ID with bearer auth, never as direct DOM URLs. */
export function useLibraryBlob(id: string, kind: 'content' | 'thumbnail', reference?: string | null, picture = false) {
  const { accountId, api, picturePreviews } = useLibraryApi();
  const query = useQuery({ queryKey: ['library', accountId, 'blob', kind, id, reference],
    // Persisted picture previews are reread locally; release their memory as soon
    // as the last card/viewer leaves the page.
    enabled: Boolean(reference), gcTime: picture && kind === 'thumbnail' ? 0 : 30_000,
    staleTime: kind === 'thumbnail' ? Infinity : 30_000,
    retry: (attempt, error) => kind === 'thumbnail' && attempt < 2 && error instanceof LibraryApiError && error.status === 503,
    retryDelay: attempt => 500 * (attempt + 1),
    queryFn: ({ signal }) => picture && kind === 'thumbnail' ? picturePreviews.read(id, reference!, signal) : api[kind](id, signal) });
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
