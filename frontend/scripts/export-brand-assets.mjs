import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(frontend, 'src/assets/brand/geometry.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { brandFaces, brandViewBox } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const css = await fs.readFile(path.join(frontend, 'src/styles/brand.css'), 'utf8');
const variables = css.match(/:root\s*\{([^}]+)\}/)[1];
const fills = brandFaces.map(face => `[data-brand-face='${face.id}']{fill:var(--brand-${face.id})}`).join('');
const paths = brandFaces.map(face => `<path data-brand-face="${face.id}" d="${face.path}"/>`).join('');
const theme = dark => dark ? '--primary:#a5c0aa;--foreground:#f5f6f2;--surface:#202620;' : '--primary:#486653;--foreground:#171815;--surface:#ffffff;';
const svg = (dark, automatic = false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${brandViewBox}" role="img" aria-label="Wukna folded W"><style>:root{${theme(dark)}${variables}}${fills}${automatic ? `@media(prefers-color-scheme:dark){:root{${theme(true)}}}` : ''}</style>${paths}</svg>\n`;
await fs.writeFile(path.join(frontend, 'public/wukna.svg'), svg(false, true));
for (const dark of [false, true]) await fs.writeFile(path.join(frontend, `src/assets/brand/wukna-symbol-${dark ? 'dark' : 'light'}.svg`), svg(dark));
console.log('Exported folded light/dark symbols and fallback browser icon.');
