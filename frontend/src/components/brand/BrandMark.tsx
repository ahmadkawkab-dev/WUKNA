import type { SVGProps } from 'react';
import { brandFaces, brandViewBox } from '../../assets/brand/geometry';

export type BrandMotion = 'still' | 'loading' | 'welcome' | 'success' | 'neon';

/** All folds retain distinct theme-derived fills, including at small sizes. */
export function BrandMark({ className = '', motion = 'still', ...props }: SVGProps<SVGSVGElement> & { motion?: BrandMotion }) {
  return (
    <svg {...props} viewBox={brandViewBox} className={`wk-brand-mark wk-brand-mark--${motion} ${className}`.trim()} aria-hidden="true" focusable="false">
      {[0, 1, 2].map(panel => <g className={`wk-brand-panel wk-brand-panel--${panel}`} key={panel}>
        {brandFaces.filter(face => face.panel === panel).map(face => <path key={face.id} data-brand-face={face.id} d={face.path} />)}
      </g>)}
      {motion === 'neon' && <g className="wk-brand-neon-edges">
        {brandFaces.map(face => <path key={face.id} d={face.path} pathLength="1" vectorEffect="non-scaling-stroke" />)}
      </g>}
    </svg>
  );
}
