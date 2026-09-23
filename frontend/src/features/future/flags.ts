export const futurePreviewEnabled = import.meta.env.DEV;

export function isFuturePreviewPath(path: string) {
  return /^\/dev\/(library|journal|pictures)$/.test(path);
}
