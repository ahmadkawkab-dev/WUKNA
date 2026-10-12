import { brandFaces } from '../../assets/brand/geometry';
import { prismDuration, prismFrameAt } from '../../assets/brand/prismMotion';

export type PrismPlaybackState = { elapsed: number };

/** A caller-owned clock carries one opening flow across loading/recovery remounts. */
export function playPrism(svg: SVGSVGElement, playback: PrismPlaybackState = { elapsed: 0 }) {
  const paths = [...svg.querySelectorAll<SVGPathElement>('[data-brand-face]')];
  const backs = [...svg.querySelectorAll<SVGPathElement>('[data-brand-back]')];
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame: number | undefined;
  let previous: number | undefined;
  const restore = () => {
    paths.forEach((path, index) => { path.setAttribute('d', brandFaces[index].path); path.removeAttribute('visibility'); });
    backs.forEach(path => { path.setAttribute('visibility', 'hidden'); path.setAttribute('d', ''); });
  };
  const stop = () => {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
    previous = undefined;
  };
  const draw = () => {
    const geometry = prismFrameAt(playback.elapsed);
    paths.forEach((path, index) => {
      path.setAttribute('d', geometry.paths[index]);
      path.setAttribute('visibility', geometry.visible[index] ? 'visible' : 'hidden');
    });
    backs.forEach((path, index) => {
      path.setAttribute('d', geometry.back[index].path);
      path.setAttribute('visibility', geometry.back[index].visible ? 'visible' : 'hidden');
    });
  };
  const tick = (now: number) => {
    frame = undefined;
    if (media.matches || document.hidden) return;
    if (previous !== undefined) playback.elapsed = (playback.elapsed + Math.min(now - previous, 100)) % prismDuration;
    previous = now;
    draw();
    frame = window.requestAnimationFrame(tick);
  };
  const sync = () => {
    stop();
    if (media.matches) { playback.elapsed = 0; restore(); }
    else { draw(); if (!document.hidden) frame = window.requestAnimationFrame(tick); }
  };
  media.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  sync();
  return () => {
    stop();
    media.removeEventListener('change', sync);
    document.removeEventListener('visibilitychange', sync);
    restore();
  };
}
