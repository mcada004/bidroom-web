"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { normalizeDisplayName } from "@/src/lib/authGuests";
import StravaConnectionCard from "@/src/components/StravaConnectionCard";

type SaveState =
  | { kind: "idle"; message: null }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function toSaveError(error: unknown) {
  const asObj = (error ?? {}) as { message?: unknown };
  return typeof asObj.message === "string" && asObj.message.trim()
    ? asObj.message
    : "Could not save your account settings. Please try again.";
}

export default function AccountPage() {
  const router = useRouter();
  const { user, loading, preferredDisplayName } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [seedUid, setSeedUid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle", message: null });

  const suggestedName = useMemo(() => {
    return preferredDisplayName === "Participant" ? "" : preferredDisplayName;
  }, [preferredDisplayName]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent("/account")}`);
      return;
    }

    if (seedUid !== user.uid) {
      setDisplayName(suggestedName);
      setSeedUid(user.uid);
      setSaveState({ kind: "idle", message: null });
    }
  }, [loading, user, router, suggestedName, seedUid]);

  async function syncTripMemberDisplayNames(uid: string, nextDisplayName: string) {
    const myTripsSnap = await getDocs(collection(db, "users", uid, "myTrips"));

    for (const tripDoc of myTripsSnap.docs) {
      const tripId = tripDoc.id;
      const memberRef = doc(db, "trips", tripId, "members", uid);

      try {
        const memberSnap = await getDoc(memberRef);
        if (!memberSnap.exists()) continue;

        const existingData = memberSnap.data() as { role?: unknown };
        const role = existingData.role === "manager" ? "manager" : "participant";

        await setDoc(memberRef, {
          displayName: nextDisplayName,
          role,
          joinedAt: serverTimestamp(),
        });
      } catch {
        // Skip trips where update fails (e.g., banned from trip)
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) return;

    const cleaned = normalizeDisplayName(displayName);
    if (!cleaned) {
      setSaveState({ kind: "error", message: "Display name must be 2-24 characters." });
      return;
    }

    setSaving(true);
    setSaveState({ kind: "idle", message: null });

    try {
      await updateProfile(user, { displayName: cleaned });

      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName: cleaned,
          email: user.email ?? "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await syncTripMemberDisplayNames(user.uid, cleaned);

      setDisplayName(cleaned);
      setSaveState({ kind: "success", message: "Saved. Your display name was updated." });
    } catch (error: unknown) {
      setSaveState({ kind: "error", message: toSaveError(error) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Redirecting to sign in…</main>;

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">My Account</h1>
        <p className="hero-subtitle">Update your profile details for trip lobbies and results.</p>
      </section>

      <section className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <label className="label">
            Email
            <input className="input" value={user.email ?? ""} disabled readOnly />
          </label>

          <label className="label">
            Display name
            <input
              className="input"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                if (saveState.kind !== "idle") setSaveState({ kind: "idle", message: null });
              }}
              minLength={2}
              maxLength={24}
              placeholder="Your name"
              autoComplete="nickname"
            />
          </label>

          <div className="row">
            <button className="button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>

          {saveState.message ? (
            <p className="notice" aria-live="polite">
              {saveState.message}
            </p>
          ) : null}
        </form>
      </section>

      <StravaConnectionCard />
    </main>
  );
}
