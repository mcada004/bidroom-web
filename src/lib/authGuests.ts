import { User } from "firebase/auth";

const GUEST_DISPLAY_NAME_KEY = "bidroom.guestDisplayName";

export function normalizeDisplayName(input: string) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2 || cleaned.length > 24) return null;
  return cleaned;
}

export function getStoredGuestDisplayName() {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(GUEST_DISPLAY_NAME_KEY);
  if (!stored) return null;
  return normalizeDisplayName(stored);
}

export function setStoredGuestDisplayName(displayName: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_DISPLAY_NAME_KEY, displayName);
}

export function getPreferredDisplayName(user: User | null) {
  if (!user) return "Participant";

  if (user.isAnonymous) {
    const stored = getStoredGuestDisplayName();
    return stored ?? "Guest";
  }

  const fromProfile = normalizeDisplayName(user.displayName ?? "");
  return fromProfile ?? "Participant";
}
