import { libraryFileCategory, parseVideoLink } from './files';
import type { LibraryAction } from './components/LibraryUI';
import type { LibraryCategory } from './types';

export function videoCapture(data: { url?: string; text?: string; title?: string }) {
  // Android often shares the URL in text rather than the url field.
  const candidates = [data.url, data.text, data.title].flatMap(value => value?.match(/https:\/\/[^\s<>"']+/g) ?? []);
  for (const candidate of candidates) {
    try {
      const link = parseVideoLink(candidate.replace(/[),.!?;]+$/, ''));
      const title = data.title?.trim();
      return { url: link.url, name: title && !title.includes('https://') ? title.slice(0, 160) : link.provider === 'youtube' ? 'YouTube video' : link.provider === 'vimeo' ? 'Vimeo video' : new URL(link.url).hostname };
    } catch { /* Try the next URL, without fetching untrusted content. */ }
  }
  throw new Error('Drop or share a valid HTTPS video link. Video files are not uploaded.');
}

export function libraryDropAction(category: LibraryCategory, data: Pick<DataTransfer, 'files' | 'getData'>, folderId?: string): LibraryAction {
  const files = Array.from(data.files);
  if (category === 'video') {
    if (files.length) throw new Error('Videos stores video links. Drop a video link instead of a video file.');
    return { type: 'video', ...videoCapture({ url: data.getData('text/uri-list').split('\n').find(line => line.trim() && !line.startsWith('#')), text: data.getData('text/plain') }), folderId, autoStart: true };
  }
  if (!files.length) throw new Error('Drop files from your device into this section.');
  if (files.length > 10) throw new Error('Add up to 10 files at a time.');
  if (files.some(file => libraryFileCategory(file) !== category)) throw new Error(`Drop ${category === 'picture' ? 'pictures into Pictures and documents into Documents' : 'documents into Documents and pictures into Pictures'}.`);
  return { type: 'upload', category, folderId, files, autoStart: true };
}
