export const libraryDestinations = [
  { section: 'dashboard', label: 'Dashboard', path: '/library' },
  { section: 'pictures', label: 'Pictures', path: '/library/pictures' },
  { section: 'documents', label: 'Documents', path: '/library/documents' },
  { section: 'videos', label: 'Videos', path: '/library/videos' },
  { section: 'collections', label: 'Collections', path: '/library/collections' },
  { section: 'favorites', label: 'Favorites', path: '/library/favorites' },
  { section: 'trash', label: 'Trash', path: '/library/trash' },
  { section: 'storage', label: 'Storage Management', path: '/library/storage' },
  { section: 'search', label: 'Global Search', path: '/library/search' },
] as const;
export type LibrarySection = typeof libraryDestinations[number]['section'];
export function isLibraryPath(path: string) { return path === '/library' || path.startsWith('/library/'); }
export function libraryRoute(path: string) { return libraryDestinations.find(destination => destination.path === path) ?? null; }
export function safeLibraryReturnPath(path: string): string | null {
  // Only exact local destinations; no URL, query string, or lookalike path can be replayed.
  return libraryRoute(path) ? path : null;
}
