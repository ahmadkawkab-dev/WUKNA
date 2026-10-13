import type { LibraryCollectionWrite, LibraryFileWrite, LibraryFolderQuery, LibraryFolderWrite, LibraryItemQuery, LibraryItemUpdate, LibraryVideoWrite, LibraryUploadCreate, LibraryUploadFinalize, LibraryUploadSession } from '../contracts';
import type { LibraryCapabilities, LibraryCollection, LibraryFolder, LibraryItemDetail, LibraryItemSummary, LibraryPage, LibrarySummary, StoragePlan } from '../types';

/** Account-scoped authenticated API boundary. */
export interface LibraryApi {
  capabilities(signal: AbortSignal): Promise<LibraryCapabilities>;
  storagePlans(signal: AbortSignal): Promise<StoragePlan[]>;
  summary(signal: AbortSignal): Promise<LibrarySummary>;
  items(query: LibraryItemQuery, signal: AbortSignal): Promise<LibraryPage<LibraryItemSummary>>;
  item(id: string, signal: AbortSignal): Promise<LibraryItemDetail>;
  folders(query: LibraryFolderQuery, signal: AbortSignal): Promise<LibraryPage<LibraryFolder>>;
  collections(cursor: string | null, limit: number, signal: AbortSignal): Promise<LibraryPage<LibraryCollection>>;
  updateItems(ids: string[], update: LibraryItemUpdate, signal: AbortSignal): Promise<void>;
  trashItems(ids: string[], signal: AbortSignal): Promise<void>;
  restoreItems(ids: string[], signal: AbortSignal): Promise<void>;
  deleteItems(ids: string[], signal: AbortSignal): Promise<void>;
  createFolder(input: LibraryFolderWrite, signal: AbortSignal): Promise<LibraryFolder>;
  deleteFolder(id: string, signal: AbortSignal): Promise<void>;
  createCollection(input: LibraryCollectionWrite, signal: AbortSignal): Promise<LibraryCollection>;
  updateCollection(id: string, input: LibraryCollectionWrite, signal: AbortSignal): Promise<void>;
  deleteCollection(id: string, signal: AbortSignal): Promise<void>;
  collectionItems(id: string, itemIds: string[], action: 'add' | 'remove', signal: AbortSignal): Promise<void>;
  addFile(input: LibraryFileWrite, signal: AbortSignal): Promise<LibraryItemDetail>;
  addVideo(input: LibraryVideoWrite, signal: AbortSignal): Promise<LibraryItemDetail>;
  content(id: string, signal: AbortSignal): Promise<Blob>;
  thumbnail(id: string, signal: AbortSignal): Promise<Blob>;
  createUpload(input: LibraryUploadCreate, signal: AbortSignal): Promise<LibraryUploadSession>;
  upload(id: string, signal: AbortSignal): Promise<LibraryUploadSession>;
  cancelUpload(id: string, signal: AbortSignal): Promise<LibraryUploadSession>;
  finalizeUpload(id: string, input: LibraryUploadFinalize, signal: AbortSignal): Promise<LibraryUploadSession>;
  uploadContent(id: string, file: Blob, signal: AbortSignal): Promise<void>;
  dispose?(): void;
}
