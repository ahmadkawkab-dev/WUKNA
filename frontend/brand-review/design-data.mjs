// Review geometry traced from the approved Canva PNG, in its 600 × 600 preview coordinates.
// These are editable reconstructions, not native paths exported by Canva.
export const folds = [
  { id: 'left-front', group: 0, d: 'M103 159 L198 204 L255 308 L184 442 L95 168 Q91 155 103 159 Z', points: [[103,159],[198,204],[255,308],[184,442],[95,168],[94,162],[96,159],[103,159]] },
  { id: 'left-return', group: 0, d: 'M184 442 L255 308 L300 391 Z', points: [[184,442],[255,308],[300,391]] },
  { id: 'left-inner', group: 0, d: 'M255 308 L300 247 L300 391 Z', points: [[255,308],[300,247],[300,391]] },
  { id: 'right-inner', group: 1, d: 'M300 247 L347 309 L300 391 Z', points: [[300,247],[347,309],[300,391]] },
  { id: 'right-fold', group: 1, d: 'M347 309 L404 204 L402 350 L300 391 Z', points: [[347,309],[404,204],[402,350],[300,391]] },
  { id: 'right-front', group: 1, d: 'M404 204 L495 159 Q510 154 505 170 L415 442 L402 350 Z', points: [[404,204],[495,159],[501,158],[505,159],[507,163],[505,170],[415,442],[402,350]] },
  { id: 'right-return', group: 1, d: 'M300 391 L402 350 L415 442 Z', points: [[300,391],[402,350],[415,442]] },
  { id: 'foot', group: 2, d: 'M300 391 L415 442 L331 442 Z', points: [[300,391],[415,442],[331,442]] },
];
export const viewBox = '90 150 425 300';
export const silhouette = 'M103 159 L198 204 L255 308 L300 247 L347 309 L404 204 L495 159 Q510 154 505 170 L415 442 L331 442 L300 391 L184 442 L95 168 Q91 155 103 159 Z';
export const lettering = [
  'M3 17 L11 15 L18 38 L26 23 L32 23 L40 38 L46 15 L54 17 L44 50 L38 52 L29 36 L20 52 L14 50 Z',
  'M63 17 L71 17 L71 37 Q71 44 80 44 Q89 44 89 37 L89 17 L97 17 L97 37 Q97 52 80 52 Q63 52 63 37 Z',
  'M111 7 L119 7 L119 53 L111 53 Z',
  'M139 14 L144 20 L124 34 L147 46 L142 53 L115 37 L115 31 Z',
  'M158 18 L166 18 L166 53 L158 53 Z',
  'M158 29 Q158 13 176 13 Q194 13 194 30 L194 53 L186 53 L186 30 Q186 21 176 21 Q166 21 166 30 Z',
  'M245 16 L245 53 L237 53 L237 47 Q231 54 220 51 Q207 48 207 33 Q207 16 220 14 Q231 11 237 18 L237 16 Z M237 32 Q237 22 226 22 Q215 22 215 33 Q215 44 226 44 Q237 44 237 32 Z',
];
export const treatments = {
  primary: ['#486653','#486653','#486653','#486653','#486653','#486653','#486653','#486653'],
  dark: Array(8).fill('#a5c0aa'),
  black: Array(8).fill('#000000'),
  white: Array(8).fill('#ffffff'),
  contrastLight: Array(8).fill('#171815'),
  contrastDark: Array(8).fill('#f5f6f2'),
  tonal: ['#486653','#152019','#476b58','#95a582','#476b58','#486653','#152019','#476b58'],
  tonalDark: ['#a5c0aa','#91bd9e','#b2bbb1','#f5f6f2','#b2bbb1','#a5c0aa','#91bd9e','#91bd9e'],
  // Color reference only. Geometry comes from the approved reference.
  reference: ['#553393','#251644','#483080','#e7ddf2','#ccb7e8','#1a1a1a','#111111','#51d0c5'],
};
export function symbolSvg(colors = treatments.primary, width = 425, height = 300) {
  const mono = colors.every(color => color === colors[0]);
  const paths = mono ? `<path d="${silhouette}" fill="${colors[0]}"/>` : `<path d="${silhouette}" fill="${colors[0]}"/>${folds.map((f,i)=>`<path data-fold="${f.id}" d="${f.d}" fill="${colors[i]}"/>`).join('')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" role="img" aria-label="Wukna folded W">${paths}</svg>`;
}
