import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
const storageKey = 'wukna.theme.v1';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();
const normalize = (value: string | null | undefined): ThemePreference =>
  value === 'light' || value === 'dark' ? value : 'system';
let preference = normalize(document.documentElement.dataset.themePreference);

function applyTheme() {
  const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  listeners.forEach((notify) => notify());
}

export function setThemePreference(value: ThemePreference) {
  preference = value;
  try { localStorage.setItem(storageKey, value); } catch { /* Remains usable in memory. */ }
  applyTheme();
}

const onStorage = (event: StorageEvent) => {
  if (event.key === storageKey || event.key === null) {
    preference = normalize(event.newValue);
    applyTheme();
  }
};
media.addEventListener('change', applyTheme);
window.addEventListener('storage', onStorage);
applyTheme();
// Vite can re-evaluate this module during development; release the old listeners.
if (import.meta.hot) import.meta.hot.dispose(() => {
  media.removeEventListener('change', applyTheme);
  window.removeEventListener('storage', onStorage);
});

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}

export function useThemePreference() {
  return useSyncExternalStore(subscribe, () => preference);
}
