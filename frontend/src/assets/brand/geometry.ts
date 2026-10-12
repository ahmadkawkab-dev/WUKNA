/** Approved folded-W reconstruction. Keep the eight faces in every treatment. */
export const brandViewBox = '90 150 425 300';
export const brandFaces = [
  { id: 'left-front', panel: 0, path: 'M103 159 L198 204 L255 308 L184 442 L95 168 Q91 155 103 159 Z' },
  { id: 'left-return', panel: 0, path: 'M184 442 L255 308 L300 391 Z' },
  { id: 'left-inner', panel: 0, path: 'M255 308 L300 247 L300 391 Z' },
  { id: 'right-inner', panel: 1, path: 'M300 247 L347 309 L300 391 Z' },
  { id: 'right-fold', panel: 1, path: 'M347 309 L404 204 L402 350 L300 391 Z' },
  { id: 'right-front', panel: 1, path: 'M404 204 L495 159 Q510 154 505 170 L415 442 L402 350 Z' },
  { id: 'right-return', panel: 1, path: 'M300 391 L402 350 L415 442 Z' },
  { id: 'foot', panel: 2, path: 'M300 391 L415 442 L331 442 Z' },
] as const;
