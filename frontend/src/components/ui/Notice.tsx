import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';

export function Notice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [closing, setClosing] = useState(false);
  const dismissRef = useRef(onDismiss);
  const manualRemove = useRef<number | null>(null);
  const generation = useRef(0);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const current = ++generation.current;
    setClosing(false);
    const exit = window.setTimeout(() => setClosing(true), 2800);
    const remove = window.setTimeout(() => { if (generation.current === current) dismissRef.current(); }, 3000);
    return () => {
      generation.current++;
      window.clearTimeout(exit);
      window.clearTimeout(remove);
      if (manualRemove.current !== null) window.clearTimeout(manualRemove.current);
    };
  }, [message]);
  function close() {
    if (closing) return;
    const current = generation.current;
    setClosing(true);
    manualRemove.current = window.setTimeout(() => {
      if (generation.current === current) dismissRef.current();
    }, 200);
  }
  return (
    <div className={`wk-notice${closing ? ' wk-notice--closing' : ''}`}>
      <p role="status" aria-atomic="true">{message}</p>
      <IconButton label="Dismiss notification" onClick={close}><X size={18} aria-hidden="true" /></IconButton>
    </div>
  );
}
