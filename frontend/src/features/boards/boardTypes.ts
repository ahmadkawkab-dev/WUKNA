import type { NoteGeometryOperation } from "../../realtime/events";

export type VisualPatch = Partial<{
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  color: string;
}>;

export type RemoteGeometryPresentation = {
  userId: string;
  label: string;
  initials: string;
  operation: NoteGeometryOperation;
  profileImageUrl?: string | null;
  username?: string | null;
};
