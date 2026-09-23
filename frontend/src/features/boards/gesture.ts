export function isDragGesture(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  threshold = 4,
): boolean {
  return Math.abs(currentX - startX) + Math.abs(currentY - startY) > threshold;
}
