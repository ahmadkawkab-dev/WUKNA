import type { CSSProperties } from "react";

export const notePigments = [
  { name: "Paper", value: "#EEE8DB" },
  { name: "Moss", value: "#DEE5D4" },
  { name: "Clay", value: "#EFDDD1" },
  { name: "Seed", value: "#EEE2BF" },
  { name: "Sky", value: "#DCE7EB" },
  { name: "Berry", value: "#EADCE1" },
] as const;

function channelToLinear(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

const darkInk = "#182018";
const lightInk = "#FFFDF8";

function luminance(hex: string) {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return 0.2126 * channelToLinear((value >> 16) & 255)
    + 0.7152 * channelToLinear((value >> 8) & 255)
    + 0.0722 * channelToLinear(value & 255);
}

function contrast(first: number, second: number) {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Keep destructive text readable on user-controlled note pigments in either app theme. */
export function noteDestructiveForeground(color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return noteForeground(color);
  const background = luminance(color);
  // Keep these contrast samples synchronized with the content pair in tokens.css.
  const darkRed = "#A13F47";
  const lightRed = "#F0A1A6";
  const preferred = contrast(background, luminance(darkRed)) >= contrast(background, luminance(lightRed))
    ? darkRed : lightRed;
  if (contrast(background, luminance(preferred)) < 4.5) return noteForeground(color);
  return preferred === darkRed
    ? "var(--destructive-on-light-content)"
    : "var(--destructive-on-dark-content)";
}

export function noteForeground(color: string) {
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) return darkInk;
  const background = luminance(color);
  const darkContrast = contrast(background, luminance(darkInk));
  const lightContrast = contrast(background, luminance(lightInk));
  if (darkContrast >= lightContrast && darkContrast >= 4.5) return darkInk;
  if (lightContrast >= 4.5) return lightInk;
  return contrast(background, 0) >= contrast(background, 1) ? "#000000" : "#FFFFFF";
}

export function noteAppearanceStyle(color: string) {
  const foreground = noteForeground(color);
  return {
    backgroundColor: color,
    color: foreground,
    colorScheme: foreground === darkInk || foreground === "#000000" ? "light" : "dark",
    "--note-background": color,
    "--note-foreground": foreground,
    "--note-destructive": noteDestructiveForeground(color),
  } as CSSProperties;
}
