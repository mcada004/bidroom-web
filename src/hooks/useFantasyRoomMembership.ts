"use client";

import { useEffect, useState } from "react";
import { signInAnonymously } from "firebase/auth";
import { doc, onSnapshot, runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { FANTASY_ROOM_ID } from "@/src/lib/fantasyRoom";

export function useFantasyRoomMembership(name: string | null, authLoading: boolean) {
  const [state, setState] = useState<{ uid: string | null; name: string | null; status: "joining" | "active" | "banned" | "error"; error: string | null }>({ uid: null, name: null, status: "joining", error: null });
  const uid = auth.currentUser?.uid;
  useEffect(() => {
    if (authLoading || !name) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    const reportError = () => { if (!cancelled) setState({ uid: auth.currentUser?.uid ?? null, name, status: "error", error: "Unable to join the room. Refresh to reconnect." }); };
    async function join() {
      const currentUser = auth.currentUser ?? (await signInAnonymously(auth)).user;
      if (cancelled) return;
      const reference = doc(db, "fantasyDrafts", FANTASY_ROOM_ID, "members", currentUser.uid);
      unsubscribe = onSnapshot(reference, snapshot => {
        if (cancelled) return;
        const status = snapshot.data()?.status;
        setState({ uid: currentUser.uid, name, status: status === "banned" ? "banned" : status === "active" ? "active" : "joining", error: null });
      }, reportError);
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(reference);
        if (snapshot.data()?.status === "banned") return;
        if (snapshot.exists()) transaction.update(reference, { displayName: name, lastSeenAt: serverTimestamp() });
        else transaction.set(reference, { displayName: name, status: "active", lastSeenAt: serverTimestamp() });
      });
      if (cancelled) return;
      interval = setInterval(() => {
        if (document.visibilityState === "visible") updateDoc(reference, { lastSeenAt: serverTimestamp() }).catch(() => { /* Membership listener reports removal or reconnect errors. */ });
      }, 30_000);
    }
    join().catch(reportError);
    return () => { cancelled = true; unsubscribe?.(); if (interval) clearInterval(interval); };
  }, [name, authLoading, uid]);
  if (!name || state.name !== name || state.uid !== auth.currentUser?.uid) return { status: "joining" as const, error: null };
  return state;
}
