import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Native modal supplies focus containment and makes the underlying page inert. */
export function Dialog({ title, children, onClose, urgent = false, className = '' }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  urgent?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ) ?? []).filter((element) => !element.hidden);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    const frame = requestAnimationFrame(() => (focusable()[0] ?? dialog)?.focus());
    return () => {
      cancelAnimationFrame(frame);
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  function containFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const targets = focusable();
    if (!targets.length) {
      event.preventDefault();
      ref.current?.focus();
      return;
    }
    const first = targets[0];
    const last = targets.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return createPortal(
    <dialog ref={ref} className={`wk-dialog ${className}`.trim()} aria-labelledby={titleId} role={urgent ? 'alertdialog' : undefined} tabIndex={-1}
      onKeyDown={containFocus}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>, document.body,
  );
}
