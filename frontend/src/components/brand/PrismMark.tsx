import { useLayoutEffect, useRef, type SVGProps } from 'react';
import { brandFaces, brandViewBox } from '../../assets/brand/geometry';
import { playPrism, type PrismPlaybackState } from './prismPlayback';
import { prismBackFaces } from '../../assets/brand/prismMotion';

/** The approved vector loop keeps the same eight theme-derived fold fills. */
export function PrismMark({ className = '', playback, ...props }: Omit<SVGProps<SVGSVGElement>, 'ref'> & { playback?: PrismPlaybackState }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    if (ref.current) return playPrism(ref.current, playback);
  }, [playback]);
  return <svg {...props} ref={ref} viewBox={brandViewBox}
    className={`wk-brand-mark wk-brand-mark--prism ${className}`.trim()} aria-hidden="true" focusable="false">
    {brandFaces.map(face => <path key={face.id} data-brand-face={face.id} d={face.path} />)}
    {prismBackFaces.map(face => <path key={`back-${face.id}`} data-brand-back={face.id} visibility="hidden" d="" />)}
  </svg>;
}
