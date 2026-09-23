export type ViewportBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ViewportDelta = {
  left: number;
  top: number;
};

export function clientPointToBoard(
  viewport: Pick<ViewportBounds, "left" | "top">,
  scroll: ViewportDelta,
  client: { x: number; y: number },
) {
  return {
    x: Math.max(0, client.x - viewport.left + scroll.left),
    y: Math.max(0, client.y - viewport.top + scroll.top),
  };
}

/** Returns the smallest scroll delta that reveals a node without recentering it. */
export function minimalRevealDelta(
  viewport: ViewportBounds,
  node: ViewportBounds,
  padding = 24,
): ViewportDelta {
  const visibleLeft = viewport.left + padding;
  const visibleRight = viewport.right - padding;
  const visibleTop = viewport.top + padding;
  const visibleBottom = viewport.bottom - padding;

  let left = 0;
  let top = 0;
  if (node.left < visibleLeft) left = node.left - visibleLeft;
  else if (node.right > visibleRight) left = node.right - visibleRight;
  if (node.top < visibleTop) top = node.top - visibleTop;
  else if (node.bottom > visibleBottom) top = node.bottom - visibleBottom;

  return { left, top };
}

export function revealBoardNode(
  viewport: HTMLElement,
  node: HTMLElement,
  padding = 24,
) {
  const delta = minimalRevealDelta(
    viewport.getBoundingClientRect(),
    node.getBoundingClientRect(),
    padding,
  );
  if (delta.left === 0 && delta.top === 0) return false;
  viewport.scrollBy({ ...delta, behavior: "auto" });
  return true;
}
