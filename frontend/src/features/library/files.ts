import type { LibraryCategory } from './types';
import { detectCodeLanguage, readLocalCodeDocument } from './documents/codeFiles';

export const libraryFileLimit = 20_000_000;
export const documentAccept = '.pdf,.docx,.xlsx,.md,' + '.cs,.ts,.tsx,.js,.jsx,.mjs,.cjs,.css,.html,.htm,.py,.sql,.json,.sh,.bash,.txt';
export const pictureAccept = '.jpg,.jpeg,.png,.webp';
export async function inspectLibraryFile(file: File, category: Exclude<LibraryCategory, 'video'>) {
  if (file.size > libraryFileLimit) throw new Error('Choose a file smaller than 20 MB. Code and text files must be smaller than 256 KB.');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (signature: number[]) => signature.every((value, index) => head[index] === value);
  if (category === 'picture') {
    const type = starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? 'image/png' :
      starts([0xff, 0xd8, 0xff]) ? 'image/jpeg' :
        starts([0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...head.slice(8, 12)) === 'WEBP' ? 'image/webp' : null;
    if (!type || !['jpg', 'jpeg', 'png', 'webp'].includes(extension ?? '')) throw new Error('Choose a valid JPG, PNG, or WebP picture.');
    let width = 0, height = 0;
    if (typeof createImageBitmap === 'function') {
      const image = await createImageBitmap(file).catch(() => { throw new Error('This picture could not be decoded. Choose another file.'); });
      width = image.width; height = image.height; image.close();
    }
    return { contentType: type, width, height };
  }
  if (detectCodeLanguage(file.name) || extension === 'md') {
    const code = await readLocalCodeDocument(extension === 'md' ? { name: 'document.txt', size: file.size, arrayBuffer: () => file.arrayBuffer() } : file);
    return { contentType: 'text/plain', code, markdown: extension === 'md' };
  }
  if (extension === 'pdf' && starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return { contentType: 'application/pdf' };
  if (['docx', 'xlsx'].includes(extension ?? '') && starts([0x50, 0x4b, 0x03, 0x04])) {
    return { contentType: extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
  throw new Error('Choose a PDF, DOCX, XLSX, Markdown, code, or UTF-8 text document. The file contents must match its format.');
}
export function parseVideoLink(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a complete HTTPS video link.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS link without embedded credentials.');
  const host = url.hostname.toLowerCase();
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
    const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
    if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Use a link to a specific YouTube video.');
    return { url: `https://www.youtube.com/watch?v=${id}`, provider: 'youtube' as const, videoId: id };
  }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const id = url.pathname.match(/^\/(?:video\/)?(\d+)\/?$/)?.[1];
    if (!id) throw new Error('Use a link to a public Vimeo video.');
    return { url: `https://vimeo.com/${id}`, provider: 'vimeo' as const, videoId: id };
  }
  return { url: url.href, provider: 'external' as const, videoId: null };
}
