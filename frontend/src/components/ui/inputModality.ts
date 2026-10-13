/** Keep keyboard focus visible without leaving a pointer action highlighted. */
export function initializeInputModality(document: Document = window.document) {
  const root = document.documentElement;
  const previous = root.dataset.inputModality;
  root.dataset.inputModality = 'keyboard';
  const pointer = () => { root.dataset.inputModality = 'pointer'; };
  const keyboard = (event: KeyboardEvent) => {
    if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return;
    root.dataset.inputModality = 'keyboard';
  };
  // Capture runs before a control opens a popup or a dialog restores focus.
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('keydown', keyboard, true);
  return () => {
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('keydown', keyboard, true);
    if (previous === undefined) delete root.dataset.inputModality;
    else root.dataset.inputModality = previous;
  };
}
