import { User } from "firebase/auth";

export function normalizeDisplayName(input: string) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2 || cleaned.length > 24) return null;
  return cleaned;
}

function emailPrefixToName(email: string | null | undefined) {
  if (!email) return null;
  const prefix = email.split("@")[0] ?? "";
  const spaced = prefix.replace(/[._-]+/g, " ").trim();
  if (!spaced) return null;

  if (spaced.length <= 24) {
    return normalizeDisplayName(spaced);
  }

  return normalizeDisplayName(spaced.slice(0, 24));
}

export function getPreferredDisplayName(user: User | null, userDocDisplayName?: string | null) {
  if (!user) return "Participant";
  if (user.isAnonymous) return "Participant";

  const fromUserDoc = normalizeDisplayName(userDocDisplayName ?? "");
  if (fromUserDoc) return fromUserDoc;
  const fromProfile = normalizeDisplayName(user.displayName ?? "");
  if (fromProfile) return fromProfile;

  return emailPrefixToName(user.email) ?? "Participant";
}
