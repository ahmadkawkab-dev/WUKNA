import { useEffect, useState } from 'react';
import type { ThemedToken } from '@shikijs/core';
import { Button } from '../../../components/ui/Button';
import { boundCodePreview, codeLanguages, type LocalCodeDocument } from './codeFiles';

export function CodeDocumentViewer({ name, source, language }: LocalCodeDocument) {
  const preview = boundCodePreview(source);
  const [highlighted, setHighlighted] = useState<{ text: string; language: string; lines: ThemedToken[][] } | null>(null);
  const [highlightFailed, setHighlightFailed] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [wrap, setWrap] = useState(false);
  useEffect(() => {
    let active = true;
    setHighlightFailed(false); setCopyStatus('');
    void import('./highlightCode').then(module => module.highlightCode(preview.text, language)).then(lines => {
      if (active) setHighlighted({ text: preview.text, language, lines });
    }).catch(() => { if (active) setHighlightFailed(true); });
    return () => { active = false; };
  }, [preview.text, language]);
  const lines: ThemedToken[][] = highlighted?.text === preview.text && highlighted.language === language ? highlighted.lines :
    preview.text.split('\n').map(content => [{ content, offset: 0 }]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(source); setCopyStatus('Code copied.'); }
    catch { setCopyStatus('Could not copy. Select the code and copy it manually.'); }
  };
  return <section className="wk-code-document" aria-label={`Code preview for ${name}`}>
    <header><div><strong>{name}</strong><span>{codeLanguages[language]} · Read-only document</span></div>
      <div className="wk-code-document-actions"><Button variant="secondary" size="compact" aria-pressed={wrap} onClick={() => setWrap(value => !value)}>Wrap lines</Button>
        <Button variant="secondary" size="compact" onClick={() => void copy()}>Copy code</Button></div></header>
    {preview.truncated && <p>Showing the first 400 lines or 30,000 characters. Copy code includes the full text.</p>}
    {highlightFailed && <p role="status">Syntax highlighting is unavailable. The code is shown as plain text.</p>}
    <pre tabIndex={0} aria-label="Code source" className={wrap ? 'wk-code-source wk-code-source--wrap' : 'wk-code-source'}><code>
      {lines.map((line, index) => <span className="wk-code-line" key={index}><span className="wk-code-line-number" aria-hidden="true">{index + 1}</span>
        <span>{line.map((token, tokenIndex) => <span key={tokenIndex} style={{ color: token.color }}>{token.content}</span>)}{'\n'}</span></span>)}
    </code></pre>
    <footer><span>{codeLanguages[language]} · UTF-8 · 2-space tabs</span><span>{source.replace(/\r\n?/g, '\n').split('\n').length} lines</span></footer>
    <p className="wk-code-copy-status" role="status">{copyStatus}</p>
  </section>;
}
