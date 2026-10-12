import type { LibraryCategory, LibraryProcessingStatus } from './types';

export type LibrarySort = 'updated-desc' | 'created-desc' | 'name-asc' | 'size-desc';
export type LibraryItemQuery = {
  category?: LibraryCategory;
  folderId?: string | null;
  collectionId?: string;
  favorite?: boolean;
  trash?: boolean;
  search?: string;
  sort?: LibrarySort;
  cursor?: string | null;
  limit?: number;
  documentKind?: 'pdf' | 'code' | 'text' | 'unavailable';
  tag?: string;
};
export type LibraryFolderQuery = { category?: LibraryCategory; parentId?: string | null; cursor?: string | null; limit?: number };
export type LibraryItemUpdate = { name?: string; description?: string | null; folderId?: string | null; favorite?: boolean; tags?: string[]; notes?: string };
export type LibraryFileWrite = { file: File; category: 'picture' | 'document'; folderId: string | null;
  onProgress?: (stage: 'checking' | 'transferring' | 'confirming') => void };
export type LibraryFolderWrite = { name: string; category: LibraryCategory; parentId: string | null };
export type LibraryCollectionWrite = { name: string; description: string | null };
export type LibraryVideoWrite = { name: string; description: string | null; folderId: string | null; url: string };

// Durable session contract. Binary transfer requires server storage availability.
export type LibraryUploadCreate = {
  clientUploadId: string; category: 'picture' | 'document'; fileName: string;
  contentType: string; sizeBytes: number; checksum: string; folderId: string | null;
};
export type LibraryUploadSession = {
  id: string; reservedBytes: number; expiresAt: string;
  state: 'reserved' | 'receiving' | 'processing' | 'complete' | 'failed' | 'cancelled' | 'expired';
  itemId: string | null; processingStatus: LibraryProcessingStatus | null;
  errorCode?: string | null; cancellationRequested?: boolean; resultPurged?: boolean;
};
export type LibraryUploadFinalize = { clientUploadId: string; checksum: string };

export type LibraryErrorCode = string;
export class LibraryApiError extends Error {
  constructor(public readonly code: LibraryErrorCode, public readonly status: number, public readonly retryAfterSeconds = 0) {
    super(code);
    this.name = 'LibraryApiError';
  }
}
export function libraryErrorMessage(error: unknown) {
  if (error instanceof LibraryApiError) {
    if (error.status === 401) return 'Your session has changed or expired. Sign in again to continue.';
    if (error.status === 403) return 'You do not have access to this Library item.';
    const messages: Record<string, string> = {
      library_invalid_cursor: 'This page has expired. Retry to start from the first page.',
      library_not_found: 'This item could not be found. Refresh the Library and try again.',
      library_quota_exceeded: 'There is not enough storage. Review Trash and pending uploads. Space is released after file cleanup finishes.',
      library_folder_name_conflict: 'A folder with this name already exists here. Choose another name.',
      library_folder_not_empty: 'This folder contains items, subfolders, or pending uploads. Clear them before deleting it.',
      library_video_duplicate: 'This video link is already in your Library. Check existing links before saving or restoring.',
      library_item_trashed: 'This item is in Trash. Restore it before editing.',
      library_upload_conflict: 'This upload conflicts with an existing attempt. Check its status before retrying.',
      library_upload_expired: 'This upload session has expired. Start a new upload.',
      library_file_type: 'This file type is not supported.',
      library_file_rejected: 'This file did not pass the security check. Choose another file.',
      library_file_too_large: 'The file or request exceeds the allowed size.',
      library_storage_unavailable: 'File storage is temporarily unavailable. Try again later.',
      library_processing_unavailable: 'This item is still processing or temporarily unavailable. Try again later.',
      library_invalid_query: 'These filters are invalid. Clear them and try again.',
      library_invalid_folder: 'Choose a folder in the same category.',
      library_invalid_item: 'Check the item details and try again.',
    };
    if (error.status === 429) return `Too many requests. Try again${error.retryAfterSeconds > 0 ? ` in ${Math.ceil(error.retryAfterSeconds)} seconds` : ' shortly'}.`;
    return messages[error.code] ?? (error.status === 409 ? 'This change conflicts with the current Library state. Refresh and try again.' : 'Could not complete the Library request. Try again.');
  }
  if (error instanceof Error && !(error instanceof LibraryApiError)) return error.message;
  return 'Could not load the Library. Try again.';
}
