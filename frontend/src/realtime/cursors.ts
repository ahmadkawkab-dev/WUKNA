import type {
  BoardCursorMovedEvent,
  BoardCursorStoppedEvent,
} from "./events";

export type BoardCursorsByConnection = Record<string, BoardCursorMovedEvent>;

export function shouldAcceptCursorMoved(
  current: BoardCursorMovedEvent | undefined,
  incoming: BoardCursorMovedEvent,
  endedSequence?: number,
) {
  if (endedSequence !== undefined && incoming.sequence <= endedSequence) return false;
  return !current || incoming.sequence > current.sequence;
}

export function applyCursorMoved(
  current: BoardCursorsByConnection,
  incoming: BoardCursorMovedEvent,
): BoardCursorsByConnection {
  const existing = current[incoming.connectionId];
  if (!shouldAcceptCursorMoved(existing, incoming)) return current;
  return { ...current, [incoming.connectionId]: incoming };
}

export function applyCursorStopped(
  current: BoardCursorsByConnection,
  incoming: BoardCursorStoppedEvent,
): BoardCursorsByConnection {
  const existing = current[incoming.connectionId];
  if (!existing || incoming.sequence < existing.sequence) return current;
  const next = { ...current };
  delete next[incoming.connectionId];
  return next;
}
