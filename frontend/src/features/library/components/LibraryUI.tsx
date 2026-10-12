import { createContext, useContext, type ReactNode } from 'react';
import { FileCode2, FileText, Image, Video, LockKeyhole, FolderOpen } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { LoadingSkeleton } from '../../../components/ui/LoadingSkeleton';
import { libraryErrorMessage } from '../contracts';
import type { LibraryCategory, LibraryCollection, LibraryItemSummary } from '../types';

export type LibraryAction =
  | { type: 'upload'; category: 'picture' | 'document'; folderId?: string | null }
  | { type: 'video'; folderId?: string | null }
  | { type: 'folder'; category: LibraryCategory; parentId?: string | null }
  | { type: 'collection'; collection?: LibraryCollection }
  | { type: 'rename' | 'metadata'; item: LibraryItemSummary & { notes?: string } }
  | { type: 'organize'; ids: string[]; category?: LibraryCategory }
  | { type: 'trash' | 'delete' | 'restore'; ids: string[] }
  | { type: 'deleteCollection'; collection: LibraryCollection }
  | { type: 'deleteFolder'; id: string; name: string }
  | { type: 'addCollectionItems'; collectionId: string };
type UI = { openCollection?: (id: string) => void; act: (action: LibraryAction) => void; open: (id: string, ids?: string[]) => void; navigate: (path: string) => void; notify: (message: string) => void };
const Context = createContext<UI | null>(null);
export function LibraryUIProvider({ value, children }: { value: UI; children: ReactNode }) { return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useLibraryUI() { const value = useContext(Context); if (!value) throw new Error('Library UI provider is required.'); return value; }
export const categoryNames: Record<LibraryCategory, string> = { picture: 'Pictures', document: 'Documents', video: 'Videos' };
export const categoryPath: Record<LibraryCategory, string> = { picture: '/library/pictures', document: '/library/documents', video: '/library/videos' };
export function ItemIcon({ item, size = 20 }: { item: LibraryItemSummary; size?: number }) {
  const Icon = item.category === 'picture' ? Image : item.category === 'video' ? Video : item.documentKind === 'code' ? FileCode2 : FileText;
  return <Icon size={size} aria-hidden="true" />;
}
export function fileType(item: LibraryItemSummary) { return item.category === 'video' ? 'Video link' : item.name.split('.').at(-1)?.toUpperCase() ?? 'File'; }
export function libraryDate(value: string) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
export function PrivateLabel() { return <span className="wk-lib-private"><LockKeyhole size={14} aria-hidden="true" /> Only you</span>; }
export function LibraryState({ pending, error, retry, empty, title = 'Nothing here yet', children }: {
  pending?: boolean; error?: unknown; retry?: () => void; empty?: boolean; title?: string; children?: ReactNode;
}) {
  if (pending) return <LoadingSkeleton label="Loading Library content" layout="cards" />;
  if (error) return <section className="wk-lib-state"><p role="alert">{libraryErrorMessage(error)}</p><Button variant="secondary" onClick={retry}>Retry</Button></section>;
  if (!empty) return null;
  return <section className="wk-lib-state"><FolderOpen size={28} aria-hidden="true" /><h2>{title}</h2><div>{children ?? <p>Add files or try another filter.</p>}</div></section>;
}
export function SectionHeading({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return <div className="wk-lib-section-heading"><div><h2>{title}</h2>{description && <div className="wk-lib-section-description">{description}</div>}</div>{children}</div>;
}
