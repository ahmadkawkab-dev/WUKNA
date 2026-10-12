function appAddress(value) {
  const url = new URL(value);
  if (url.username || url.password || !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use an HTTPS Wukna address, or localhost for development.');
  return { origin: url.origin, permission: `${url.protocol}//${url.hostname}/*` };
}
function youtubeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) throw new Error('Open a YouTube video before saving.');
  const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
  if (!/^[A-Za-z0-9_-]{11}$/.test(id ?? '')) throw new Error('Open a specific YouTube video before saving.');
  return `https://www.youtube.com/watch?v=${id}`;
}
async function capture(message, sender) {
  if (sender.id !== chrome.runtime.id || !(sender.url?.startsWith(chrome.runtime.getURL('')) || /^https:\/\/(?:www\.|m\.)?youtube\.com\//.test(sender.url ?? ''))) throw new Error('Unsupported share source.');
  const url = youtubeUrl(message.url), title = typeof message.title === 'string' ? message.title.trim().slice(0, 160) : 'YouTube video';
  const { wuknaAddress } = await chrome.storage.local.get('wuknaAddress');
  if (!wuknaAddress) { await chrome.runtime.openOptionsPage(); throw new Error('Set your Wukna address in extension settings, then try again.'); }
  const app = appAddress(wuknaAddress);
  if (!await chrome.permissions.contains({ origins: [app.permission] })) { await chrome.runtime.openOptionsPage(); throw new Error('Allow access to your Wukna address in extension settings.'); }
  const tab = await chrome.tabs.create({ url: `${app.origin}/library/videos`, active: true });
  const key = `capture:${tab.id}`;
  await chrome.storage.session.set({ [key]: { id: crypto.randomUUID(), url, title, origin: app.origin, createdAt: Date.now() } });
  // A cached tab can finish loading before its pending capture is stored.
  const current = await chrome.tabs.get(tab.id);
  if (current.status === 'complete') await deliver(tab.id, current);
  return { opened: true };
}
const delivering = new Set();
async function deliver(tabId, tab) {
  if (delivering.has(tabId)) return;
  delivering.add(tabId);
  try { await deliverPending(tabId, tab); } finally { delivering.delete(tabId); }
}
async function deliverPending(tabId, tab) {
  const key = `capture:${tabId}`, saved = (await chrome.storage.session.get(key))[key];
  if (!saved) return;
  if (saved.createdAt < Date.now() - 900000) { await chrome.storage.session.remove(key); return; }
  if (!tab.url || new URL(tab.url).origin !== saved.origin) return;
  try {
    const result = await chrome.scripting.executeScript({ target: { tabId }, args: [saved], func: data => new Promise(resolve => {
      const timer = setTimeout(() => { window.removeEventListener('message', accepted); resolve(false); }, 5000);
      function accepted(event) {
        if (event.source === window && event.origin === location.origin && event.data?.type === 'wukna:library-share-accepted' && event.data.id === data.id) {
          clearTimeout(timer); window.removeEventListener('message', accepted); resolve(true);
        }
      }
      window.addEventListener('message', accepted);
      window.postMessage({ type: 'wukna:capture-video', id: data.id, url: data.url, title: data.title }, location.origin);
    }) });
    if (result[0]?.result === true) await chrome.storage.session.remove(key);
  } catch { /* Keep the pending capture for a reload, without claiming a save succeeded. */ }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'capture-video') return;
  capture(message, sender).then(respond, error => respond({ error: error.message }));
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => { if (change.status === 'complete') void deliver(tabId, tab); });
chrome.tabs.onRemoved.addListener(tabId => { void chrome.storage.session.remove(`capture:${tabId}`); });
chrome.runtime.onInstalled.addListener(details => { if (details.reason === 'install') void chrome.runtime.openOptionsPage(); });
