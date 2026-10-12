const status = document.getElementById('status'), button = document.getElementById('save');
document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.runtime.sendMessage({ type: 'capture-video', url: tab?.url, title: tab?.title?.replace(/ - YouTube$/, '') });
    status.textContent = response?.error || 'Opened Wukna. The save result appears there.';
  } catch { status.textContent = 'Could not open Wukna. Open Settings and check your connection.'; }
  finally { button.disabled = false; }
});
