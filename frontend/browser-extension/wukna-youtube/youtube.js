let scheduled = false;
function addButton() {
  scheduled = false;
  const panel = document.querySelector('ytd-unified-share-panel-renderer, ytd-share-dialog-renderer');
  if (!panel || panel.querySelector('.wukna-youtube-share')) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'wukna-youtube-share';
  button.setAttribute('aria-label', 'Save this video to Wukna'); button.title = 'Save this video to your Wukna Library';
  const icon = document.createElement('img'); icon.src = chrome.runtime.getURL('wukna.svg'); icon.alt = '';
  const label = document.createElement('span'); label.textContent = 'Wukna'; button.append(icon, label);
  const status = document.createElement('span'); status.className = 'wukna-youtube-status'; status.setAttribute('role', 'status');
  button.addEventListener('click', async event => {
    if (!event.isTrusted || button.disabled) return;
    button.disabled = true; status.textContent = '';
    try {
      const title = document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata')?.textContent?.trim() || document.title.replace(/ - YouTube$/, '');
      const response = await chrome.runtime.sendMessage({ type: 'capture-video', url: location.href, title });
      status.textContent = response?.error || 'Opened Wukna. The save result appears there.';
    } catch { status.textContent = 'Could not open Wukna. Check the extension settings and try again.'; }
    finally { button.disabled = false; }
  });
  const group = document.createElement('div'); group.className = 'wukna-youtube-capture'; group.append(button, status);
  panel.append(group);
}
new MutationObserver(() => { if (!scheduled) { scheduled = true; requestAnimationFrame(addButton); } }).observe(document.body, { childList: true, subtree: true });
addButton();
