import { videoCapture } from './capture';

const key = 'wukna.library.shared-video';
const tokenKey = 'wukna.library.share-token';
const errorKey = 'wukna.library.share-error';
const validId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
let systemShareInFlight: Promise<void> | null = null;
let shareGeneration = 0;
export type PendingVideoShare = { id: string; url: string; name: string; createdAt: number };
export function pendingVideoShare(): PendingVideoShare | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (data && validId(data.id) && typeof data.createdAt === 'number' && data.createdAt <= Date.now() && data.createdAt > Date.now() - 900000 && typeof data.url === 'string' && typeof data.name === 'string') return data;
    sessionStorage.removeItem(key);
  } catch { /* A share cannot be resumed without site storage. */ }
  return null;
}
export function pendingLibrarySharePath() {
  try { return pendingVideoShare() || validId(sessionStorage.getItem(tokenKey)) ? '/library/videos' : null; } catch { return null; }
}
export function clearLibraryShare(id?: string) {
  shareGeneration++;
  try { if (!id || pendingVideoShare()?.id === id) sessionStorage.removeItem(key); sessionStorage.removeItem(tokenKey); if (!id) sessionStorage.removeItem(errorKey); } catch { /* No persisted share. */ }
}
export function takeLibraryShareError() {
  try { const error = sessionStorage.getItem(errorKey); sessionStorage.removeItem(errorKey); return error; } catch { return null; }
}
function receive(data: { id: string; title?: string; text?: string; url?: string; createdAt: number }) {
  const capture = videoCapture(data);
  sessionStorage.setItem(key, JSON.stringify({ id: data.id, ...capture, createdAt: data.createdAt }));
  window.dispatchEvent(new Event('wukna:library-share'));
}
async function receiveSystemShare(id: string) {
  const generation = shareGeneration;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('wukna-library-shares', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('shares', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    const data = await new Promise<{ id: string; title: string; text: string; url: string; createdAt: number } | undefined>((resolve, reject) => {
      const transaction = db.transaction('shares', 'readwrite'), store = transaction.objectStore('shares'), request = store.get(id);
      let record: { id: string; title: string; text: string; url: string; createdAt: number } | undefined;
      request.onsuccess = () => { record = request.result; store.delete(id); };
      transaction.oncomplete = () => resolve(record); transaction.onerror = () => reject(transaction.error);
    });
    if (data && generation === shareGeneration && sessionStorage.getItem(tokenKey) === id && data.createdAt <= Date.now() && data.createdAt > Date.now() - 900000) receive(data);
  } finally { db.close(); try { if (sessionStorage.getItem(tokenKey) === id) sessionStorage.removeItem(tokenKey); } catch { /* No persisted token. */ } }
}
export function resumePendingLibraryShare(): Promise<void> {
  let id: string | null;
  try { id = sessionStorage.getItem(tokenKey); } catch { return Promise.resolve(); }
  if (!validId(id) || pendingVideoShare()) return Promise.resolve();
  const generation = shareGeneration;
  if (!systemShareInFlight) systemShareInFlight = receiveSystemShare(id).catch(failure => {
    if (generation !== shareGeneration) return;
    clearLibraryShare();
    try { sessionStorage.setItem(errorKey, failure instanceof Error ? failure.message : 'Could not receive this share. Use Save video link and try again.'); } catch { /* Site storage is unavailable. */ }
    window.dispatchEvent(new Event('wukna:library-share'));
  }).finally(() => { systemShareInFlight = null; });
  return systemShareInFlight;
}
export function initializeLibraryShare() {
  // Extension delivery is accepted only from this page's own window and origin.
  const message = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== 'wukna:capture-video') return;
    const data = event.data;
    if (!validId(data.id) || typeof data.url !== 'string' || data.url.length > 2000 || typeof data.title !== 'string' || data.title.length > 160) return;
    try {
      shareGeneration++;
      receive({ id: data.id, url: data.url, title: data.title, createdAt: Date.now() });
      window.postMessage({ type: 'wukna:library-share-accepted', id: data.id }, window.location.origin);
    } catch { /* Invalid links are not accepted or saved. */ }
  };
  window.addEventListener('message', message);
  const id = new URLSearchParams(window.location.search).get('share');
  if (window.location.pathname === '/library/videos' && validId(id)) {
    try { sessionStorage.setItem(tokenKey, id); } catch { /* The shared URL still opens Videos. */ }
    window.history.replaceState(window.history.state, '', '/library/videos');
  }
  if (window.location.pathname === '/library/videos') void resumePendingLibraryShare();
  if (window.isSecureContext && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/notification-worker.js', { scope: '/' }).catch(() => undefined);
  return () => window.removeEventListener('message', message);
}
