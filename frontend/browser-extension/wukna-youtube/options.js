const input = document.getElementById('address'), status = document.getElementById('status');
chrome.storage.local.get('wuknaAddress').then(settings => { input.value = settings.wuknaAddress || 'http://localhost:5173'; });
document.getElementById('settings').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const url = new URL(input.value);
    if (url.username || url.password || !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use HTTPS or a localhost development address.');
    const origin = `${url.protocol}//${url.hostname}/*`;
    const allowed = await chrome.permissions.request({ origins: [origin] });
    if (!allowed) throw new Error('Allow access to your Wukna address to connect it.');
    const previous = (await chrome.storage.local.get('wuknaAddress')).wuknaAddress;
    await chrome.storage.local.set({ wuknaAddress: url.origin }); input.value = url.origin;
    if (previous) { const old = new URL(previous), oldPermission = `${old.protocol}//${old.hostname}/*`; if (oldPermission !== origin) await chrome.permissions.remove({ origins: [oldPermission] }); }
    status.textContent = 'Connected. On a YouTube video, open Share and choose Wukna, or use the extension button.';
  } catch (error) { status.textContent = error.message; }
});
