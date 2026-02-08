import { User } from "firebase/auth";

export function normalizeDisplayName(input: string) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2 || cleaned.length > 24) return null;
  return cleaned;
}

export function getPreferredDisplayName(user: User | null) {
  if (!user) return "Participant";

  const fromProfile = normalizeDisplayName(user.displayName ?? "");
  return fromProfile ?? "Participant";
}
