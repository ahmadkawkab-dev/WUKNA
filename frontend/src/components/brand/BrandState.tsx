import { BrandMark } from './BrandMark';
import { Button } from '../ui/Button';
import { PrismMark } from './PrismMark';
import type { PrismPlaybackState } from './prismPlayback';

/** Visual feedback only: the caller owns readiness and removes this immediately. */
export function BrandState({ label, fullscreen = false, motion = 'loading', playback }: { label: string; fullscreen?: boolean; motion?: 'loading' | 'prism'; playback?: PrismPlaybackState }) {
  return <div className={`wk-brand-state${fullscreen ? ' wk-brand-state--fullscreen' : ''}`} role="status" aria-live="polite" aria-busy="true">
    <div className="wk-brand-state-lockup" aria-hidden="true">
      {motion === 'prism' ? <PrismMark playback={playback} /> : <BrandMark motion="loading" />}
      <span>wukna</span>
    </div>
    <p>{label}</p>
  </div>;
}

/** A failed restore is recoverable, not a busy state. Preserve the actual error reason. */
export function BrandRecovery({ reason, onRetry, playback }: { reason: string; onRetry: () => void; playback?: PrismPlaybackState }) {
  return <main className="wk-brand-recovery">
    <div className="wk-brand-recovery-content">
      <div className="wk-brand-state-lockup" aria-hidden="true">
        <PrismMark playback={playback} />
        <span>wukna</span>
      </div>
      <div className="wk-brand-recovery-copy" role="alert">
        <h1>Could not restore your session</h1>
        <p>{reason}</p>
      </div>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  </main>;
}
