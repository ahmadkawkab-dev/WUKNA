import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `export * from './src/features/library/documents/codeFiles'; export * from './src/features/library/documents/highlightCode';`,
    resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { detectCodeLanguage, readLocalCodeDocument, boundCodePreview, highlightCode } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

test('code documents recognize common uploaded file extensions without trusting MIME labels', async () => {
  for (const [extension, language] of Object.entries({ CS: 'csharp', ts: 'typescript', js: 'javascript', tsx: 'tsx', jsx: 'jsx', css: 'css', html: 'html', py: 'python', sql: 'sql', json: 'json', sh: 'bash', txt: 'plaintext' })) {
    assert.equal(detectCodeLanguage(`sample.${extension}`), language);
  }
  const source = '<script>window.shouldNeverRun = true</script>\nconst café = "☕";';
  const document = await readLocalCodeDocument(new File([source], 'example.js', { type: 'application/octet-stream' }));
  assert.equal(document.source, source);
  assert.equal(document.language, 'javascript');
  assert.equal(globalThis.shouldNeverRun, undefined);
});

test('local previews reject unsupported, binary, non-UTF8 and oversized files before rendering', async () => {
  await assert.rejects(readLocalCodeDocument(new File(['text'], 'document.pdf')), /supported code/);
  await assert.rejects(readLocalCodeDocument(new File([new Uint8Array([0, 1, 2])], 'binary.js')), /Binary/);
  await assert.rejects(readLocalCodeDocument(new File([new Uint8Array([0xff, 0xfe])], 'bad.py')), /UTF-8/);
  let read = false;
  await assert.rejects(readLocalCodeDocument({ name: 'big.ts', size: 256_001, arrayBuffer: async () => { read = true; } }), /256 KB/);
  assert.equal(read, false);
  assert.equal((await readLocalCodeDocument(new File([], 'empty.txt'))).source, '');
});

test('large source previews stay bounded while the complete original remains available for copying', () => {
  const source = 'const value = 1;\r\n'.repeat(1000);
  const preview = boundCodePreview(source);
  assert.equal(preview.truncated, true);
  assert.ok(preview.text.split('\n').length <= 400);
  assert.equal(source.split('\r\n').length, 1001);
  assert.ok(boundCodePreview('x'.repeat(50_000)).text.length <= 30_000);
});

test('real Shiki grammars preserve source and provide theme-aware tokens for each supported language', async () => {
  const samples = {
    csharp: 'public class Example { public string Name = "Hi"; }',
    typescript: 'const value: number = 42;', javascript: 'const value = "Hi";',
    python: 'def greet():\n    return "Hi"', sql: 'SELECT id FROM notes;',
    json: '{"value": 42}', bash: 'echo "Hi"', plaintext: '<script>doNotExecute()</script>',
    tsx: 'const element = <p>Hello</p>;', jsx: 'const element = <p>Hello</p>;',
    css: ':root { --color: #486653; }', html: '<script>doNotExecute()</script>',
  };
  for (const [language, source] of Object.entries(samples)) {
    const lines = await highlightCode(source, language);
    assert.equal(lines.map(line => line.map(token => token.content).join('')).join('\n'), source);
    if (language !== 'plaintext') assert.ok(lines.flat().some(token => token.color?.includes('--wk-code-token-')), language);
  }
});
