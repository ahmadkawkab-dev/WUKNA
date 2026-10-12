import type { CodeLanguage } from '../types';

export const codeLanguages: Record<CodeLanguage, string> = {
  csharp: 'C#', typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python',
  tsx: 'TSX', jsx: 'JSX', css: 'CSS', html: 'HTML',
  sql: 'SQL', json: 'JSON', bash: 'Bash', plaintext: 'Plain text',
};
const extensions: Record<string, CodeLanguage> = {
  cs: 'csharp', ts: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', sql: 'sql', json: 'json', sh: 'bash', bash: 'bash', txt: 'plaintext',
  tsx: 'tsx', jsx: 'jsx', css: 'css', html: 'html', htm: 'html',
};
export const codeFileAccept = Object.keys(extensions).map(extension => `.${extension}`).join(',');
export type LocalCodeDocument = { name: string; language: CodeLanguage; source: string };
export function detectCodeLanguage(name: string): CodeLanguage | null {
  return extensions[name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}
/** Bounded client inspection before upload; the server independently verifies and scans content. */
export async function readLocalCodeDocument(file: Pick<File, 'name' | 'size' | 'arrayBuffer'>): Promise<LocalCodeDocument> {
  const language = detectCodeLanguage(file.name);
  if (!language) throw new Error('Choose a supported code or text file.');
  if (file.size > 256_000) throw new Error('Code and text files support up to 256 KB.');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > 256_000) throw new Error('Code and text files support up to 256 KB.');
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Code and text files require UTF-8 encoding.'); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)) throw new Error('Binary files cannot be previewed as code.');
  return { name: file.name, language, source };
}
export function boundCodePreview(source: string) {
  const normalized = source.replace(/\r\n?/g, '\n');
  const text = normalized.slice(0, 30_000).split('\n').slice(0, 400).join('\n');
  return { text, truncated: text.length < normalized.length };
}
