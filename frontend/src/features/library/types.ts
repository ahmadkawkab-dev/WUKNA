export type LibraryCategory = 'picture' | 'document' | 'video';
export type LibraryProcessingStatus = 'pending' | 'quarantined' | 'processing' | 'available' | 'failed';
export type CodeLanguage = 'csharp' | 'typescript' | 'javascript' | 'tsx' | 'jsx' | 'css' | 'html' | 'python' | 'sql' | 'json' | 'bash' | 'plaintext';
export type DocumentPreview =
  | { previewKind: 'pdf' | 'unavailable' }
  | { previewKind: 'text'; text?: string }
  | { previewKind: 'code'; language: CodeLanguage; source: string };

export type LibraryItemSummary = {
  id: string;
  category: LibraryCategory;
  name: string;
  description: string | null;
  folderId: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  processingStatus: LibraryProcessingStatus;
  sizeBytes: number;
  thumbnailReference: string | null;
  documentKind?: 'pdf' | 'code' | 'text' | 'unavailable';
  tags?: string[];
};

export type LibraryAsset = {
  id: string;
  contentType: string | null;
  originalFileName: string;
  sizeBytes: number;
  checksum: string | null;
  processingStatus: LibraryProcessingStatus;
};

export type LibraryItemDetail = LibraryItemSummary & { contentReference?: string | null; notes?: string; folderBreadcrumb?: LibraryFolder[] } & (
  | { category: 'picture'; asset: LibraryAsset; width: number; height: number; alt: string }
  | ({ category: 'document'; asset: LibraryAsset } & DocumentPreview)
  | { category: 'video'; provider: 'youtube' | 'vimeo' | 'external'; videoId: string | null; url: string; creator: string | null; metadataTitle?: string | null; metadataErrorCode?: string | null }
);

export type LibraryFolder = {
  id: string; name: string; category: LibraryCategory; parentId: string | null;
  createdAt: string; updatedAt: string;
};
export type LibraryCollection = {
  id: string; name: string; description: string | null; itemCount: number;
  createdAt: string; updatedAt: string;
};
export type LibraryCollectionItem = { collectionId: string; itemId: string; addedAt: string };
export type LibraryPage<T> = { items: T[]; nextCursor: string | null };
export type StorageSummary = {
  quotaBytes: number; usedBytes: number; reservedBytes: number; availableBytes: number;
  entitlementSource: 'free' | 'subscription' | 'manual';
};
export type LibrarySummary = {
  categories: { category: LibraryCategory; itemCount: number }[];
  storage: StorageSummary;
};

// Capability comes from the server; display-only paid plans cannot grant storage.
export type StoragePlan = {
  id: string; name: string; quotaBytes: number; checkoutEnabled: false;
};
export type LibraryCapabilities = { storageAvailable: boolean; checkoutEnabled: boolean };
