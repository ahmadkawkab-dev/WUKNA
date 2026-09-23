// Runs before the application/styles load. Storage can be disabled by the browser.
(function () {
  var preference = 'system';
  try {
    var saved = localStorage.getItem('wukna.theme.v1');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch (_) { /* Keep the system preference when storage is unavailable. */ }
  var dark = preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}());
