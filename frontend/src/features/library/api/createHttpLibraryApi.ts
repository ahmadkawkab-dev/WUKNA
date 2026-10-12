import { apiFetch, AuthApiError, currentSession } from '../../../auth';
import { LibraryApiError } from '../contracts';
import type { LibraryApi } from './LibraryApi';
import { inspectLibraryFile } from '../files';
import type { LibraryUploadCreate, LibraryUploadSession } from '../contracts';

const base = '/api/library';
const idPath = (resource: string, id: string) => `${base}/${resource}/${encodeURIComponent(id)}`;

// Omitted means unrestricted; explicit null means root. Preserve false, zero and
// opaque cursor characters rather than relying on truthiness/string concatenation.
function queryPath(resource: string, query: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || key === 'cursor' && value === null) continue;
    params.set(key, value === null ? 'root' : String(value));
  }
  return `${base}/${resource}${params.size ? `?${params}` : ''}`;
}

/** Uses the existing memory-token/HttpOnly-cookie lifecycle, bound to one account. */
export function createHttpLibraryApi(accountId: string): LibraryApi {
  const lifetime = new AbortController();
  const attempts = new WeakMap<File, Map<string, { input: LibraryUploadCreate; session?: LibraryUploadSession }>>();
  function checkAccount(signal: AbortSignal) {
    signal.throwIfAborted(); lifetime.signal.throwIfAborted();
    if (currentSession()?.user.id !== accountId) throw new LibraryApiError('account_changed', 401);
  }
  async function response(path: string, signal: AbortSignal, method = 'GET', body?: object | Blob) {
    const combined = AbortSignal.any([signal, lifetime.signal, AbortSignal.timeout(body instanceof Blob ? 300_000 : 30_000)]);
    combined.throwIfAborted();
    let result: Response;
    try {
      result = await apiFetch(path, {
        method, signal: combined, cache: 'no-store',
        headers: body ? { 'Content-Type': body instanceof Blob ? 'application/octet-stream' : 'application/json' } : undefined,
        body: body instanceof Blob ? body : body === undefined ? undefined : JSON.stringify(body),
      }, accountId);
    } catch (error) {
      if (error instanceof AuthApiError) throw new LibraryApiError(error.code, error.status);
      throw error;
    }
    combined.throwIfAborted();
    if (currentSession()?.user.id !== accountId) throw new LibraryApiError('account_changed', 401);
    if (!result.ok) {
      const payload = await result.json().catch(() => null);
      const retry = result.headers.get('Retry-After');
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.max(0, (Date.parse(retry) - Date.now()) / 1000) : 0;
      throw new LibraryApiError(typeof payload?.code === 'string' ? payload.code : typeof payload?.error === 'string' ? payload.error : 'library_unavailable',
        result.status, Number.isFinite(seconds) ? seconds : 0);
    }
    return result;
  }
  async function json<T>(path: string, signal: AbortSignal, method = 'GET', body?: object): Promise<T> {
    const result = await (await response(path, signal, method, body)).json() as T;
    checkAccount(signal); return result;
  }
  async function command(path: string, signal: AbortSignal, method: string, body?: object | Blob) {
    await response(path, signal, method, body);
  }
  const api: LibraryApi = {
    capabilities: signal => json(`${base}/capabilities`, signal),
    storagePlans: signal => json('/api/subscriptions/storage-plans', signal),
    summary: signal => json(`${base}/summary`, signal),
    items: (query, signal) => json(queryPath('items', query), signal),
    item: (id, signal) => json(idPath('items', id), signal),
    folders: (query, signal) => json(queryPath('folders', query), signal),
    collections: (cursor, limit, signal) => json(queryPath('collections', { cursor, limit }), signal),
    updateItems: (ids, update, signal) => ids.length === 1
      ? command(idPath('items', ids[0]), signal, 'PATCH', update)
      : command(`${base}/items/bulk-update`, signal, 'POST', { ids, update }),
    trashItems: (ids, signal) => command(`${base}/items/trash`, signal, 'POST', { ids }),
    restoreItems: (ids, signal) => command(`${base}/items/restore`, signal, 'POST', { ids }),
    deleteItems: (ids, signal) => command(`${base}/items/purge`, signal, 'POST', { ids }),
    createFolder: (input, signal) => json(`${base}/folders`, signal, 'POST', input),
    deleteFolder: (id, signal) => command(idPath('folders', id), signal, 'DELETE'),
    createCollection: (input, signal) => json(`${base}/collections`, signal, 'POST', input),
    updateCollection: (id, input, signal) => command(idPath('collections', id), signal, 'PUT', input),
    deleteCollection: (id, signal) => command(idPath('collections', id), signal, 'DELETE'),
    collectionItems: (id, itemIds, action, signal) => command(`${idPath('collections', id)}/items/${action}`, signal, 'POST', { itemIds }),
    addVideo: (input, signal) => json(`${base}/videos`, signal, 'POST', input),
    addFile: async (input, signal) => {
      const combined = AbortSignal.any([signal, lifetime.signal]); checkAccount(combined);
      if (!(await api.capabilities(combined)).storageAvailable) throw new LibraryApiError('library_storage_unavailable', 503);
      input.onProgress?.('checking');
      const inspected = await inspectLibraryFile(input.file, input.category); checkAccount(combined);
      const checksum = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await input.file.arrayBuffer()))]
        .map(byte => byte.toString(16).padStart(2, '0')).join(''); checkAccount(combined);
      const destination = `${input.category}:${input.folderId ?? 'root'}`;
      let fileAttempts = attempts.get(input.file);
      if (!fileAttempts) { fileAttempts = new Map(); attempts.set(input.file, fileAttempts); }
      let attempt = fileAttempts.get(destination);
      if (attempt?.session && ['failed', 'cancelled', 'expired'].includes(attempt.session.state)) attempt = undefined;
      if (!attempt) {
        attempt = { input: { clientUploadId: crypto.randomUUID(), category: input.category,
          fileName: input.file.name, contentType: inspected.contentType, sizeBytes: input.file.size, checksum, folderId: input.folderId } };
        fileAttempts.set(destination, attempt);
      }
      try {
        // Replay the same durable operation on ambiguous failures, including a lost create response.
        attempt.session = await api.createUpload(attempt.input, combined);
        if (['failed', 'cancelled', 'expired'].includes(attempt.session.state))
          throw new LibraryApiError(attempt.session.errorCode ?? 'library_upload_expired', 409);
        if (attempt.session.state !== 'complete') {
          input.onProgress?.('transferring');
          await api.uploadContent(attempt.session.id, input.file, combined);
        }
        input.onProgress?.('confirming');
        attempt.session = await api.finalizeUpload(attempt.session.id, { clientUploadId: attempt.input.clientUploadId, checksum }, combined);
        if (attempt.session.state !== 'complete' || !attempt.session.itemId || attempt.session.resultPurged)
          throw new LibraryApiError('library_upload_conflict', 409);
        return await api.item(attempt.session.itemId, combined);
      } catch (error) {
        // Keep unknown outcomes retryable with the same operation ID. Only confirmed
        // terminal states permit a fresh operation; cancellation also fences server publication.
        if (attempt.session && !lifetime.signal.aborted && currentSession()?.user.id === accountId) {
          try { attempt.session = combined.aborted
            ? await api.cancelUpload(attempt.session.id, AbortSignal.timeout(5_000))
            : await api.upload(attempt.session.id, AbortSignal.timeout(5_000)); } catch { /* Original error remains actionable. */ }
        }
        throw error;
      }
    },
    content: async (id, signal) => {
      const blob = await (await response(`${idPath('items', id)}/content`, signal)).blob();
      checkAccount(signal); return blob;
    },
    thumbnail: async (id, signal) => {
      const result = await response(`${idPath('items', id)}/thumbnail`, signal);
      if (result.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'image/png')
        throw new LibraryApiError('library_processing_unavailable', 503);
      const blob = await result.blob(); checkAccount(signal); return blob;
    },
    createUpload: (input, signal) => json(`${base}/uploads`, signal, 'POST', input),
    upload: (id, signal) => json(idPath('uploads', id), signal),
    cancelUpload: (id, signal) => json(idPath('uploads', id), signal, 'DELETE'),
    finalizeUpload: (id, input, signal) => json(`${idPath('uploads', id)}/finalize`, signal, 'POST', input),
    uploadContent: (id, file, signal) => command(`${idPath('uploads', id)}/content`, signal, 'PUT', file),
    dispose: () => lifetime.abort(),
  };
  return api;
}
