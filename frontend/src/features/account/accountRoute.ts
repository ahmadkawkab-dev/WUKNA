export type AccountSection = "profile" | "preferences";

export function accountSectionForPath(path: string): AccountSection | null {
  if (path === "/account/preferences") return "preferences";
  if (path === "/account/profile" || path === "/account") return "profile";
  return null;
}
