import { useState, type DragEvent } from 'react';
import { libraryDropAction } from '../capture';
import { useLibraryCapabilities } from './useLibraryQueries';
import { useLibraryUI } from '../components/LibraryUI';
import type { LibraryCategory } from '../types';

export function useLibraryDrop() {
  const [target, setTarget] = useState<LibraryCategory | null>(null);
  const capabilities = useLibraryCapabilities(); const { act, notify, captureAvailable } = useLibraryUI();
  const accepts = (event: DragEvent) => ['Files', 'text/uri-list', 'text/plain'].some(type => Array.from(event.dataTransfer.types).includes(type));
  return { target, handlers: (category?: LibraryCategory, folderId?: string) => category ? {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!accepts(event)) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = captureAvailable === false || category !== 'video' && capabilities.data?.storageAvailable !== true ? 'none' : 'copy';
      setTarget(category);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setTarget(null); },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault(); event.stopPropagation(); setTarget(null);
      if (captureAvailable === false) { notify('Finish the current Library action before dropping more content.'); return; }
      if (category !== 'video' && capabilities.data?.storageAvailable !== true) { notify('File storage is unavailable. Try again later.'); return; }
      try { act(libraryDropAction(category, event.dataTransfer, folderId)); }
      catch (failure) { notify(failure instanceof Error ? failure.message : 'Could not add the dropped content.'); }
    },
  } : {} };
}
