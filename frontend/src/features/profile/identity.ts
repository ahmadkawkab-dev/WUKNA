export type Identity = {
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
};

export function identityLabel(identity: Identity): string {
  return identity.displayName?.trim() || identity.username?.trim() || identity.email?.trim() || "Wukna user";
}
