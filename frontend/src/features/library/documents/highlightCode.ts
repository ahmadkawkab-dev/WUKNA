import { createCssVariablesTheme, createHighlighterCore, type ThemedToken } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import type { CodeLanguage } from '../types';

const languages = {
  csharp: () => import('@shikijs/langs/csharp'),
  typescript: () => import('@shikijs/langs/typescript'),
  javascript: () => import('@shikijs/langs/javascript'),
  tsx: () => import('@shikijs/langs/tsx'),
  jsx: () => import('@shikijs/langs/jsx'),
  css: () => import('@shikijs/langs/css'),
  html: () => import('@shikijs/langs/html'),
  python: () => import('@shikijs/langs/python'),
  sql: () => import('@shikijs/langs/sql'),
  json: () => import('@shikijs/langs/json'),
  bash: () => import('@shikijs/langs/bash'),
};
const theme = createCssVariablesTheme({ name: 'wukna-code', variablePrefix: '--wk-code-' });
let highlighter: ReturnType<typeof createHighlighterCore> | undefined;
// Shared grammar state contains no document source or tokens.
const loaded = new Map<CodeLanguage, Promise<void>>();
export async function highlightCode(source: string, language: CodeLanguage): Promise<ThemedToken[][]> {
  highlighter ??= createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine() })
    .catch(error => { highlighter = undefined; throw error; });
  const engine = await highlighter;
  if (language !== 'plaintext') {
    if (!loaded.has(language)) loaded.set(language, languages[language]().then(grammar => engine.loadLanguage(grammar.default))
      .catch(error => { loaded.delete(language); throw error; }));
    await loaded.get(language);
  }
  return engine.codeToTokens(source, { lang: language === 'plaintext' ? 'text' : language, theme: theme.name! }).tokens;
}
