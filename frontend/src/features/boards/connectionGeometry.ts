import type { ConnectionDto, NoteDto } from "../../api";

type Rect = Pick<NoteDto, "positionX" | "positionY" | "width" | "height">;
type Point = { x: number; y: number; dx: number; dy: number };

function anchors(note: Rect): Point[] {
  const x = note.positionX ?? 0;
  const y = note.positionY ?? 0;
  return [
    { x: x + note.width, y: y + note.height / 2, dx: 1, dy: 0 },
    { x, y: y + note.height / 2, dx: -1, dy: 0 },
    { x: x + note.width / 2, y: y + note.height, dx: 0, dy: 1 },
    { x: x + note.width / 2, y, dx: 0, dy: -1 },
  ];
}

export function nearestConnectionPath(source: Rect, target: Rect) {
  let nearest: { start: Point; end: Point; distanceSquared: number } | null = null;
  for (const start of anchors(source)) {
    for (const end of anchors(target)) {
      const distanceSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
      if (!nearest || distanceSquared < nearest.distanceSquared)
        nearest = { start, end, distanceSquared };
    }
  }
  const { start, end, distanceSquared } = nearest!;
  const handle = Math.max(40, Math.min(140, Math.sqrt(distanceSquared) * .42));
  const controlStart = { x: start.x + start.dx * handle, y: start.y + start.dy * handle };
  const controlEnd = { x: end.x + end.dx * handle, y: end.y + end.dy * handle };
  return `M ${start.x} ${start.y} C ${controlStart.x} ${controlStart.y}, ${controlEnd.x} ${controlEnd.y}, ${end.x} ${end.y}`;
}

export function connectedNoteIds(noteId: string, edges: ConnectionDto[]) {
  const connected = new Set<string>();
  for (const edge of edges) {
    if (edge.sourceNoteId === noteId) connected.add(edge.targetNoteId);
    else if (edge.targetNoteId === noteId) connected.add(edge.sourceNoteId);
  }
  return connected;
}

export function notesAreConnected(firstId: string, secondId: string, edges: ConnectionDto[]) {
  return edges.some((edge) =>
    (edge.sourceNoteId === firstId && edge.targetNoteId === secondId) ||
    (edge.sourceNoteId === secondId && edge.targetNoteId === firstId));
}
