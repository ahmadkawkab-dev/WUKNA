import { LibraryApiError } from './contracts';

const databaseName = 'wukna-library-picture-previews';
const storeName = 'thumbnails';
export const pictureCacheLimits = { entries: 128, bytes: 32 * 1024 * 1024, age: 7 * 24 * 60 * 60 * 1000 };
type Preview = { key: string; accountId: string; id: string; blob: Blob; savedAt: number; usedAt: number };
let generation = 0;

// An optional acceleration layer: blocked storage, quota limits and private browsing
// must never prevent an authenticated network preview from loading.
async function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise(resolve => {
    const request = indexedDB.open(databaseName, 1);
    let finished = false;
    const finish = (db: IDBDatabase | null) => {
      if (finished) { db?.close(); return; }
      finished = true; clearTimeout(timeout); resolve(db);
    };
    const timeout = setTimeout(() => finish(null), 1000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'key' });
    };
    request.onsuccess = () => finish(request.result);
    request.onerror = request.onblocked = () => finish(null);
  });
}
async function transaction<T>(operation: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T | undefined> {
  try {
    const db = await database(); if (!db) return undefined;
    return await new Promise<T | undefined>(resolve => {
      let value: T | undefined;
      const tx = db.transaction(storeName, 'readwrite');
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onerror = tx.onabort = () => { db.close(); resolve(undefined); };
      try { operation(tx.objectStore(storeName), result => { value = result; }); }
      catch { tx.abort(); }
    });
  } catch { return undefined; }
}

/** Explicit sign-out/session expiry clears disk previews and fences late writes. */
export async function clearPictureThumbnailCache() {
  generation++;
  await transaction(store => { store.clear(); });
}

export function createPictureThumbnailCache(accountId: string,
  load: (id: string, signal: AbortSignal) => Promise<Blob>, authorize: () => void) {
  const lifetime = new AbortController();
  const born = generation;
  const revisions = new Map<string, number>();
  let tail: Promise<unknown> = Promise.resolve();
  let prepared: Promise<unknown> | undefined;
  const check = (signal: AbortSignal, id: string, revision: number) => {
    signal.throwIfAborted(); lifetime.signal.throwIfAborted(); authorize();
    if (born !== generation || (revisions.get(id) ?? 0) !== revision) throw new DOMException('Preview cache changed.', 'AbortError');
  };
  const prepare = () => prepared ??= transaction(store => {
    lifetime.signal.throwIfAborted(); authorize();
    if (born !== generation) return;
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result; if (!cursor) return;
      const row = cursor.value as Preview;
      if (row.accountId !== accountId || Date.now() - row.savedAt >= pictureCacheLimits.age) cursor.delete();
      cursor.continue();
    };
  });
  const forget = async (ids: string[]) => {
    ids.forEach(id => revisions.set(id, (revisions.get(id) ?? 0) + 1));
    await transaction(store => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result; if (!cursor) return;
        const row = cursor.value as Preview;
        if (row.accountId === accountId && ids.includes(row.id)) cursor.delete();
        cursor.continue();
      };
    });
  };
  return {
    prepare,
    forget,
    dispose: () => lifetime.abort(),
    async read(id: string, reference: string, signal: AbortSignal): Promise<Blob> {
      const revision = revisions.get(id) ?? 0;
      const combined = AbortSignal.any([signal, lifetime.signal]);
      check(combined, id, revision); await prepare(); check(combined, id, revision);
      const key = JSON.stringify([accountId, id, reference]);
      const cached = await transaction<Blob>((store, result) => {
        const request = store.get(key);
        request.onsuccess = () => {
          const row = request.result as Preview | undefined;
          if (!row) return;
          if (Date.now() - row.savedAt >= pictureCacheLimits.age || row.blob?.type !== 'image/png') { store.delete(key); return; }
          store.put({ ...row, usedAt: Date.now() });
          result(row.blob);
        };
      });
      check(combined, id, revision); if (cached) return cached;
      // One cold preview at a time leaves room for uploads/original-file reads
      // within the server's bounded transfer gate. Cached reads never join this queue.
      const next = tail.catch(() => undefined).then(async () => {
        check(combined, id, revision);
        let blob: Blob;
        try { blob = await load(id, combined); }
        catch (error) {
          if (error instanceof LibraryApiError && [401, 403, 404].includes(error.status)) await forget([id]);
          throw error;
        }
        check(combined, id, revision);
        if (blob.type === 'image/png' && blob.size <= 1_000_000) await transaction(store => {
          check(combined, id, revision);
          const now = Date.now(); store.put({ key, accountId, id, blob, savedAt: now, usedAt: now } satisfies Preview);
          const request = store.getAll();
          request.onsuccess = () => {
            const rows = (request.result as Preview[]).sort((a, b) => b.usedAt - a.usedAt);
            let bytes = 0;
            rows.forEach((row, index) => {
              bytes += row.blob.size;
              if (index >= pictureCacheLimits.entries || bytes > pictureCacheLimits.bytes || now - row.savedAt >= pictureCacheLimits.age) store.delete(row.key);
            });
          };
        });
        check(combined, id, revision); return blob;
      });
      tail = next;
      return next;
    },
  };
}
