/* Receive installed-app link shares. Never saves to the API or caches authenticated content. */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname !== '/library/share' || event.request.method !== 'POST') return;
  event.respondWith((async () => {
    const origin = event.request.headers.get('Origin');
    if (event.request.mode !== 'navigate' || event.request.headers.get('Sec-Fetch-Site') === 'cross-site' || origin && origin !== 'null' && origin !== self.location.origin)
      return new Response('Use your device share menu to share into Wukna.', { status: 403 });
    if (Number(event.request.headers.get('Content-Length')) > 16384) return new Response('Shared content is too large.', { status: 413 });
    try {
      const form = await event.request.formData();
      const field = (name, limit) => typeof form.get(name) === 'string' ? form.get(name).slice(0, limit) : '';
      const record = { id: crypto.randomUUID(), title: field('title', 160), text: field('text', 4000), url: field('url', 2000), createdAt: Date.now() };
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('wukna-library-shares', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('shares', { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const transaction = db.transaction('shares', 'readwrite'), store = transaction.objectStore('shares');
          const cursor = store.openCursor(); cursor.onsuccess = () => {
            const entry = cursor.result;
            if (entry) { if (entry.value.createdAt < Date.now() - 900000) entry.delete(); entry.continue(); }
          };
          store.put(record); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
        });
      } finally { db.close(); }
      return Response.redirect(`${self.location.origin}/library/videos?share=${record.id}`, 303);
    } catch { return new Response('Could not receive this share. Open Wukna and paste the video link.', { status: 503 }); }
  })());
});
