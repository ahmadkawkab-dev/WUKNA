import type { CSSProperties } from "react";

const collaboratorCount = 6;
const paletteIndexByUser = new Map<string, number>();

export function stablePaletteIndex(userId: string) {
  const cached = paletteIndexByUser.get(userId);
  if (cached !== undefined) return cached;
  let hash = 2166136261;
  for (const character of userId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const index = (hash >>> 0) % collaboratorCount;
  paletteIndexByUser.set(userId, index);
  return index;
}

export function collaboratorStyle(userId: string) {
  const number = stablePaletteIndex(userId) + 1;
  return {
    "--collaborator-color": `var(--collaborator-${number})`,
    "--collaborator-on-color": `var(--collaborator-${number}-foreground)`,
  } as CSSProperties;
}

export function collaboratorName(email: string) {
  const localPart = email.split("@")[0];
  const words = localPart.split(/[._-]+/).filter(Boolean);
  const name = words.map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
  return name || "Board viewer";
}

export function collaboratorInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts.at(-1)?.[0] ?? "" : parts[0][1] ?? "";
  return `${first}${last}`.toUpperCase();
}
