"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  setDoc,
  updateDoc,
  runTransaction,
  writeBatch,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";
import {
  getPreferredDisplayName,
  getStoredGuestDisplayName,
  normalizeDisplayName,
  setStoredGuestDisplayName,
} from "@/src/lib/authGuests";

type Room = {
  id: string;
  name: string;
  capacity: number;
  startingPrice: number;

  currentHighBidAmount: number;
  currentHighBidderUid: string | null;
  currentHighBidTimeMs: number | null;

  winnerUid?: string | null;
  winnerAmount?: number | null;
};

type Member = {
  uid: string;
  displayName: string;
  role: "manager" | "participant";
};

type Trip = {
  name: string;
  status: "draft" | "live" | "ended";
  inviteCode: string;
  listingUrl?: string | null;
  listingTitle?: string | null;
  listingImageUrl?: string | null;
  listingBedrooms?: number | null;
  listingBeds?: number | null;
  listingBaths?: number | null;

  createdByUid: string;

  totalPrice: number;
  roomCount: number;

  bidIncrement: number;
  auctionDurationHours: number;

  antiSnipeWindowMinutes: number;
  antiSnipeExtendMinutes: number;

  auctionStartAt?: any;
  auctionEndAt?: any;
};

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatListingCount(value: number | null | undefined, singularLabel: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${value} ${singularLabel}${value === 1 ? "" : "s"}`;
}

type FirestoreLikeError = {
  code?: string;
  message?: string;
  details?: unknown;
};

declare global {
  interface Window {
    __bidroomAuth?: {
      getUser: () => typeof auth.currentUser;
      getUid: () => string | undefined;
      getToken: () => Promise<string | undefined>;
    };
  }
}

const DEBUG_BIDS = process.env.NEXT_PUBLIC_DEBUG_BIDS === "true";
const DEBUG_BID_SPLIT = process.env.NEXT_PUBLIC_DEBUG_BID_SPLIT === "true";

function extractFirestoreError(err: unknown) {
  const asObj = (err ?? {}) as FirestoreLikeError;
  return {
    code: typeof asObj.code === "string" ? asObj.code : "unknown",
    message: typeof asObj.message === "string" ? asObj.message : "Unknown Firestore error",
    details: "details" in asObj ? asObj.details : undefined,
  };
}

function debugBidLog(event: string, payload?: unknown) {
  if (!DEBUG_BIDS) return;
  console.log(`[bid-debug] ${event}`, payload ?? "");
}

function debugBidWriteIntent(payload: {
  projectId: string | null;
  uid: string;
  isAnonymous: boolean | null;
  tripPath: string;
  roomPath: string;
  bidPayload: { amount: number; bidderUid: string; bidTimeMs: number; createdAt: Timestamp };
  roomPayload: {
    currentHighBidAmount: number;
    currentHighBidderUid: string;
    currentHighBidAt: Timestamp;
    currentHighBidTimeMs: number;
  };
}) {
  if (!DEBUG_BIDS) return;
  console.log("[bid-debug] bid_write_intent_pre_tx", payload);
}

export default function TripPage() {
  const params = useParams<{ tripId: string }>();
  const searchParams = useSearchParams();
  const tripId = params.tripId;
  const inviteCode = useMemo(() => searchParams.get("code") ?? "", [searchParams]);

  const { user, loading } = useAuth();
  const isGuestView = !user;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [busyRoomId, setBusyRoomId] = useState<string | null>(null);
  const [busyAdmin, setBusyAdmin] = useState(false);
  const [busyGuestAuth, setBusyGuestAuth] = useState(false);
  const [guestActionError, setGuestActionError] = useState<string | null>(null);
  const [bidAuthError, setBidAuthError] = useState<string | null>(null);
  const [bidActionError, setBidActionError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [copyError, setCopyError] = useState<string | null>(null);

  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.__bidroomAuth = {
      getUser: () => auth.currentUser,
      getUid: () => auth.currentUser?.uid,
      getToken: async () => auth.currentUser?.getIdToken(),
    };

    return () => {
      delete window.__bidroomAuth;
    };
  }, []);

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const isManager = useMemo(() => !!(user && trip && user.uid === trip.createdByUid), [user, trip]);

  const memberNameByUid = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.uid] = m.displayName;
    return map;
  }, [members]);

  const endAtMs = useMemo(() => {
    if (!trip?.auctionEndAt) return null;
    try {
      return trip.auctionEndAt.toMillis();
    } catch {
      try {
        return new Date(trip.auctionEndAt).getTime();
      } catch {
        return null;
      }
    }
  }, [trip]);

  const remainingMs = useMemo(() => (endAtMs ? endAtMs - nowMs : null), [endAtMs, nowMs]);

  function leadingBidderLabel(uid: string | null) {
    if (!uid) return null;
    if (isGuestView) return "Participant";
    return memberNameByUid[uid] ?? "(signed-in user)";
  }

  function maxAllowedForRoom(roomId: string) {
    if (!trip) return 0;
    const sumOther = rooms.reduce((sum, r) => (r.id === roomId ? sum : sum + (r.currentHighBidAmount || 0)), 0);
    return Math.max(0, trip.totalPrice - sumOther);
  }

  function promptForGuestName() {
    if (typeof window === "undefined") return null;

    let initial = getStoredGuestDisplayName() ?? "";
    while (true) {
      const input = window.prompt("Enter a display name (2-24 characters).", initial);
      if (input === null) return null;

      const normalized = normalizeDisplayName(input);
      if (normalized) return normalized;

      window.alert("Display name must be between 2 and 24 characters.");
      initial = input;
    }
  }

  // ✅ LIVE subscriptions
  useEffect(() => {
    let unsubTrip: (() => void) | null = null;
    let unsubRooms: (() => void) | null = null;
    let unsubMembers: (() => void) | null = null;

    async function boot() {
      setError(null);

      const tripRef = doc(db, "trips", tripId);
      const snap = await getDoc(tripRef);
      if (!snap.exists()) {
        setError("Trip not found");
        return;
      }
      const data = snap.data() as any;

      if (inviteCode && data.inviteCode && inviteCode !== data.inviteCode) {
        setError("Invalid invite link");
        return;
      }

      // join
      if (user) {
        const displayName = getPreferredDisplayName(user);
        await setDoc(
          doc(db, "trips", tripId, "members", user.uid),
          {
            displayName,
            role: user.uid === data.createdByUid ? "manager" : "participant",
            joinedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      unsubTrip = onSnapshot(
        tripRef,
        (s) => {
          const t = s.data() as any;
          setTrip({ ...t, status: (t.status ?? "draft") as any });
        },
        (e) => setError(`Trip subscription error: ${e.message}`)
      );

      unsubRooms = onSnapshot(
        collection(db, "trips", tripId, "rooms"),
        (snap2) => {
          const list = snap2.docs.map((d) => {
            const r = d.data() as any;
            return {
              id: d.id,
              name: r.name ?? "Room",
              capacity: Number(r.capacity ?? 0),
              startingPrice: Number(r.startingPrice ?? 0),
              currentHighBidAmount: Number(r.currentHighBidAmount ?? 0),
              currentHighBidderUid: r.currentHighBidderUid ?? null,
              currentHighBidTimeMs: typeof r.currentHighBidTimeMs === "number" ? r.currentHighBidTimeMs : null,
              winnerUid: r.winnerUid ?? null,
              winnerAmount: typeof r.winnerAmount === "number" ? r.winnerAmount : null,
            } as Room;
          });
          setRooms(list);
        },
        (e) => setError(`Rooms subscription error: ${e.message}`)
      );

      if (user) {
        unsubMembers = onSnapshot(
          collection(db, "trips", tripId, "members"),
          (snap3) => {
            const list = snap3.docs.map((d) => {
              const m = d.data() as any;
              return {
                uid: d.id,
                displayName: m.displayName ?? d.id,
                role: (m.role ?? "participant") as any,
              } as Member;
            });

            list.sort((a, b) => {
              if (a.role !== b.role) return a.role === "manager" ? -1 : 1;
              return a.displayName.localeCompare(b.displayName);
            });

            setMembers(list);
          },
          (e) => setError(`Members subscription error: ${e.message}`)
        );
      } else {
        setMembers([]);
      }
    }

    if (!loading) boot().catch((e: any) => setError(e?.message ?? "Failed to load"));

    return () => {
      if (unsubTrip) unsubTrip();
      if (unsubRooms) unsubRooms();
      if (unsubMembers) unsubMembers();
    };
  }, [tripId, inviteCode, user, loading]);

  // ---------- Admin helpers (core) ----------
  async function startAuctionCore() {
    if (!trip) return;
    const durationMs = (trip.auctionDurationHours || 24) * 60 * 60 * 1000;
    const endMs = Date.now() + durationMs;

    await updateDoc(doc(db, "trips", tripId), {
      status: "live",
      auctionStartAt: serverTimestamp(),
      auctionEndAt: new Date(endMs),
    });
  }

  async function resetAuctionCore() {
    // Clears bids + winners + current highs and puts trip back to draft (no timers)
    const roomsSnap = await getDocs(collection(db, "trips", tripId, "rooms"));

    let batch = writeBatch(db);
    let ops = 0;

    async function commitIfNeeded(force = false) {
      if (force || ops >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }

    batch.update(doc(db, "trips", tripId), {
      status: "draft",
      auctionStartAt: null,
      auctionEndAt: null,
    });
    ops += 1;

    for (const roomDoc of roomsSnap.docs) {
      const roomId = roomDoc.id;

      // delete bids subcollection
      const bidsSnap = await getDocs(collection(db, "trips", tripId, "rooms", roomId, "bids"));
      for (const bidDoc of bidsSnap.docs) {
        batch.delete(doc(db, "trips", tripId, "rooms", roomId, "bids", bidDoc.id));
        ops += 1;
        await commitIfNeeded();
      }

      batch.update(doc(db, "trips", tripId, "rooms", roomId), {
        currentHighBidAmount: 0,
        currentHighBidderUid: null,
        currentHighBidAt: null,
        currentHighBidTimeMs: null,
        winnerUid: null,
        winnerAmount: null,
      });
      ops += 1;
      await commitIfNeeded();
    }

    await commitIfNeeded(true);
  }

  async function finalizeAuctionCore() {
    // Assign winners (no multi-room winners), then mark ended
    const winnersAssigned = new Set<string>();
    const roomsSorted = [...rooms].sort((a, b) => (b.currentHighBidAmount || 0) - (a.currentHighBidAmount || 0));
    const batch = writeBatch(db);

    for (const room of roomsSorted) {
      const bidsSnap = await getDocs(collection(db, "trips", tripId, "rooms", room.id, "bids"));

      const bids = bidsSnap.docs
        .map((d) => d.data() as any)
        .filter((b) => typeof b.amount === "number" && typeof b.bidTimeMs === "number" && typeof b.bidderUid === "string")
        .sort((a, b) => (b.amount !== a.amount ? b.amount - a.amount : a.bidTimeMs - b.bidTimeMs)); // tie => earliest

      const winnerBid = bids.find((b) => !winnersAssigned.has(b.bidderUid));
      const roomRef = doc(db, "trips", tripId, "rooms", room.id);

      if (winnerBid) {
        winnersAssigned.add(winnerBid.bidderUid);
        batch.update(roomRef, { winnerUid: winnerBid.bidderUid, winnerAmount: winnerBid.amount });
      } else {
        batch.update(roomRef, { winnerUid: null, winnerAmount: null });
      }
    }

    batch.update(doc(db, "trips", tripId), { status: "ended" });
    await batch.commit();
  }

  // ---------- Admin actions (buttons) ----------
  async function startAuction() {
    if (!trip || !isManager) return;
    setBusyAdmin(true);
    try {
      await startAuctionCore();
      alert("Auction started.");
    } catch (e: any) {
      alert(e?.message ?? "Start auction failed");
    } finally {
      setBusyAdmin(false);
    }
  }

  async function endAuctionNow() {
    if (!trip || !isManager) return;
    const ok = window.confirm("End the auction now and finalize winners?");
    if (!ok) return;

    setBusyAdmin(true);
    try {
      await updateDoc(doc(db, "trips", tripId), { auctionEndAt: new Date() });
      await finalizeAuctionCore();
      alert("Auction ended + finalized.");
    } catch (e: any) {
      alert(e?.message ?? "End auction failed");
    } finally {
      setBusyAdmin(false);
    }
  }

  async function restartAuction() {
    if (!trip || !isManager) return;
    const ok = window.confirm("Restart auction? This clears all bids and starts a new auction immediately.");
    if (!ok) return;

    setBusyAdmin(true);
    try {
      await resetAuctionCore();   // wipe everything back to draft
      await startAuctionCore();   // start fresh
      alert("Auction restarted.");
    } catch (e: any) {
      alert(e?.message ?? "Restart failed");
    } finally {
      setBusyAdmin(false);
    }
  }

  async function resetToDraft() {
    if (!trip || !isManager) return;
    const ok = window.confirm("Reset to draft? This clears all bids and winners.");
    if (!ok) return;

    setBusyAdmin(true);
    try {
      await resetAuctionCore();
      alert("Reset complete (draft).");
    } catch (e: any) {
      alert(e?.message ?? "Reset failed");
    } finally {
      setBusyAdmin(false);
    }
  }

  async function continueAsGuest() {
    if (!trip || loading) return;

    const displayName = promptForGuestName();
    if (!displayName) return;

    setGuestActionError(null);
    setBusyGuestAuth(true);

    try {
      setStoredGuestDisplayName(displayName);
      debugBidLog("continue_as_guest_start", {
        tripId,
        currentUserUid: user?.uid ?? null,
        currentUserAnonymous: user?.isAnonymous ?? null,
      });
      const signedInUser = auth.currentUser ?? (await signInAnonymously(auth)).user;
      await signedInUser.getIdToken(true);
      const nextUser = auth.currentUser ?? signedInUser;
      if (!nextUser?.uid) throw new Error("Sign in / Continue as guest to bid");
      setBidAuthError(null);
      setBidActionError(null);

      const memberRef = doc(db, "trips", tripId, "members", nextUser.uid);

      await setDoc(
        memberRef,
        {
          displayName,
          role: nextUser.uid === trip.createdByUid ? "manager" : "participant",
          joinedAt: Timestamp.now(),
        },
        { merge: true }
      );
      debugBidLog("continue_as_guest_success", {
        uid: nextUser.uid,
        isAnonymous: nextUser.isAnonymous,
        memberPath: memberRef.path,
        displayName,
      });
    } catch (e: unknown) {
      const parsed = extractFirestoreError(e);
      const code = parsed.code;
      const message = parsed.message;

      if (code === "auth/operation-not-allowed") {
        setGuestActionError("Anonymous sign-in is not enabled in Firebase Auth.");
      } else if (code === "auth/network-request-failed") {
        setGuestActionError("Network request failed. Check your connection and try again.");
      } else {
        setGuestActionError(message);
      }
      debugBidLog("continue_as_guest_failed", {
        tripId,
        code: parsed.code,
        message: parsed.message,
        details: parsed.details,
      });
    } finally {
      setBusyGuestAuth(false);
    }
  }

  // ---------- Bidding ----------
  async function placeBid(room: Room) {
    if (!trip) return;

    const authUser = auth.currentUser;
    debugBidLog("bid_auth_check", {
      uid: authUser?.uid ?? null,
      isAnonymous: authUser?.isAnonymous ?? null,
      hasCurrentUser: !!authUser,
    });
    const uid = authUser?.uid;
    const optimisticAmount =
      (room.currentHighBidAmount || 0) === 0 ? Math.max(room.startingPrice || 0, 1) : (room.currentHighBidAmount || 0) + trip.bidIncrement;
    const localEndRaw = trip.auctionEndAt ?? null;
    const localEndMs =
      localEndRaw && typeof localEndRaw.toMillis === "function"
        ? localEndRaw.toMillis()
        : localEndRaw
          ? new Date(localEndRaw).getTime()
          : null;
    const localAuctionLiveNow = trip.status === "live" && (localEndMs === null || nowMs <= localEndMs);
    debugBidLog("bid_preflight", {
      uid: uid ?? null,
      isAnonymous: authUser?.isAnonymous ?? null,
      tripId,
      roomId: room.id,
      amount: optimisticAmount,
    });
    debugBidLog("bid_rule_snapshot_pre_tx", {
      authUid: uid ?? null,
      authAnonymous: authUser?.isAnonymous ?? null,
      tripStatus: trip.status,
      tripAuctionEndAtRaw: localEndRaw,
      tripAuctionEndAtMs: localEndMs,
      auctionLiveNow: localAuctionLiveNow,
      roomCurrentHighBidAmount: room.currentHighBidAmount ?? 0,
      roomStartingPrice: room.startingPrice ?? 0,
      computedNextBid: optimisticAmount,
      nextBidGtCurrent: optimisticAmount > (room.currentHighBidAmount ?? 0),
    });

    if (!uid) {
      setBidAuthError("Sign in / Continue as guest to bid");
      setBidActionError("Sign in / Continue as guest to bid");
      return;
    }
    setBidAuthError(null);
    setBidActionError(null);

    if (trip.status !== "live") return alert("Auction is not live yet.");
    if (endAtMs && nowMs >= endAtMs) return alert("Auction has ended.");

    setBusyRoomId(room.id);
    const tripRefPath = `trips/${tripId}`;
    const roomRefPath = `trips/${tripId}/rooms/${room.id}`;
    const bidTimeMsPreview = Date.now();
    const createdAtPreview = Timestamp.now();
    const currentHighBidAtPreview = Timestamp.now();
    const projectId = (auth.app.options.projectId as string | undefined) ?? (db.app.options.projectId as string | undefined) ?? null;
    debugBidWriteIntent({
      projectId,
      uid,
      isAnonymous: authUser?.isAnonymous ?? null,
      tripPath: tripRefPath,
      roomPath: roomRefPath,
      bidPayload: {
        amount: optimisticAmount,
        bidderUid: uid,
        bidTimeMs: bidTimeMsPreview,
        createdAt: createdAtPreview,
      },
      roomPayload: {
        currentHighBidAmount: optimisticAmount,
        currentHighBidderUid: uid,
        currentHighBidAt: currentHighBidAtPreview,
        currentHighBidTimeMs: bidTimeMsPreview,
      },
    });
    debugBidLog("bid_write_paths", { tripPath: tripRefPath, roomPath: roomRefPath });
    let bidRefPath: string | null = null;
    let txStage = "start";
    let attemptedAntiSnipeUpdate = false;
    let pendingAntiSnipeEndAt: Date | null = null;
    let failureTripStatus: string = trip.status;
    let failureCurrentBid = room.currentHighBidAmount ?? 0;
    let failureNextBid = optimisticAmount;
    let failureAuctionEnded = !!(endAtMs && nowMs >= endAtMs);

    try {
      if (DEBUG_BID_SPLIT) {
        const tripRef = doc(db, "trips", tripId);
        const roomRef = doc(db, "trips", tripId, "rooms", room.id);

        txStage = "split_read_trip_room";
        const [tripSnap, roomSnap] = await Promise.all([getDoc(tripRef), getDoc(roomRef)]);
        if (!tripSnap.exists() || !roomSnap.exists()) throw new Error("Missing trip/room");

        const t = tripSnap.data() as any;
        const r = roomSnap.data() as any;
        const txNowMs = Date.now();

        const totalPrice = Number(t.totalPrice ?? 0);
        const bidIncrement = Number(t.bidIncrement ?? 20);
        const current = Number(r.currentHighBidAmount ?? 0);
        const starting = Number(r.startingPrice ?? 0);
        const nextBid = current === 0 ? Math.max(starting, 1) : current + bidIncrement;
        const txEndRaw = t.auctionEndAt ?? null;
        const txEndMs = txEndRaw && typeof txEndRaw.toMillis === "function" ? txEndRaw.toMillis() : null;

        failureTripStatus = String(t.status ?? "unknown");
        failureCurrentBid = current;
        failureNextBid = nextBid;
        failureAuctionEnded = txEndMs !== null ? txNowMs > txEndMs : false;

        const sumOther = rooms.reduce((sum, rr) => (rr.id === room.id ? sum : sum + (rr.currentHighBidAmount || 0)), 0);
        const maxAllowed = Math.max(0, totalPrice - sumOther);
        if (nextBid > totalPrice) throw new Error("Bid cannot exceed total trip price.");
        if (nextBid > maxAllowed) throw new Error(`Bid too high. Max allowed for this room is $${maxAllowed}.`);

        const bidTimeMs = Date.now();
        const bidRef = doc(collection(db, "trips", tripId, "rooms", room.id, "bids"));
        bidRefPath = bidRef.path;
        const createdAtTs = Timestamp.now();
        const currentHighBidAtTs = Timestamp.now();

        const bidCreatePayload = { amount: nextBid, bidderUid: uid, bidTimeMs, createdAt: createdAtTs };
        const roomUpdatePayload = {
          currentHighBidAmount: nextBid,
          currentHighBidderUid: uid,
          currentHighBidAt: currentHighBidAtTs,
          currentHighBidTimeMs: bidTimeMs,
        };

        debugBidLog("bid_split_payloads", {
          bidPath: bidRef.path,
          roomPath: roomRef.path,
          bidPayload: bidCreatePayload,
          roomPayload: roomUpdatePayload,
        });
        debugBidLog("bid_split_readonly_preview", {
          reason: "Split mode is read-only; writes are executed only in the main transaction path.",
          bidPath: bidRef.path,
          roomPath: roomRef.path,
        });
      }

      if (DEBUG_BIDS) {
        const memberRef = doc(db, "trips", tripId, "members", uid);
        const memberSnap = await getDoc(memberRef);
        debugBidLog("bid_user_context", {
          uid,
          isAnonymous: authUser?.isAnonymous ?? null,
          memberExists: memberSnap.exists(),
          memberPath: memberRef.path,
          tripPath: tripRefPath,
          roomPath: roomRefPath,
        });
      }

      await runTransaction(db, async (tx) => {
        txStage = "read_trip_room";
        const tripRef = doc(db, "trips", tripId);
        const roomRef = doc(db, "trips", tripId, "rooms", room.id);

        const tripSnap = await tx.get(tripRef);
        const roomSnap = await tx.get(roomRef);
        if (!tripSnap.exists() || !roomSnap.exists()) throw new Error("Missing trip/room");

        const t = tripSnap.data() as any;
        const r = roomSnap.data() as any;
        const txNowMs = Date.now();

        const totalPrice = Number(t.totalPrice ?? 0);
        const bidIncrement = Number(t.bidIncrement ?? 20);
        const antiExt = Number(t.antiSnipeExtendMinutes ?? 10);
        const txEndRaw = t.auctionEndAt ?? null;
        const txEndMs = txEndRaw && typeof txEndRaw.toMillis === "function" ? txEndRaw.toMillis() : null;
        const txAuctionLiveNow = t.status === "live" && (txEndMs === null || txNowMs <= txEndMs);

        const current = Number(r.currentHighBidAmount ?? 0);
        const starting = Number(r.startingPrice ?? 0);
        const nextBid = current === 0 ? Math.max(starting, 1) : current + bidIncrement;

        failureTripStatus = String(t.status ?? "unknown");
        failureCurrentBid = current;
        failureNextBid = nextBid;
        failureAuctionEnded = txEndMs !== null ? txNowMs > txEndMs : false;

        debugBidLog("bid_rule_snapshot_tx", {
          authUid: uid,
          authAnonymous: authUser?.isAnonymous ?? null,
          tripStatus: t.status ?? null,
          tripAuctionEndAtRaw: txEndRaw,
          tripAuctionEndAtMs: txEndMs,
          auctionLiveNow: txAuctionLiveNow,
          roomCurrentHighBidAmount: current,
          roomStartingPrice: starting,
          computedNextBid: nextBid,
          nextBidGtCurrent: nextBid > current,
        });

        const sumOther = rooms.reduce((sum, rr) => (rr.id === room.id ? sum : sum + (rr.currentHighBidAmount || 0)), 0);
        const maxAllowed = Math.max(0, totalPrice - sumOther);

        if (nextBid > totalPrice) throw new Error("Bid cannot exceed total trip price.");
        if (nextBid > maxAllowed) throw new Error(`Bid too high. Max allowed for this room is $${maxAllowed}.`);

        const bidTimeMs = Date.now();
        const createdAtTs = Timestamp.now();
        const currentHighBidAtTs = Timestamp.now();

        // tie-break earliest wins
        const existingAmt = Number(r.currentHighBidAmount ?? 0);
        const existingTime = typeof r.currentHighBidTimeMs === "number" ? r.currentHighBidTimeMs : null;
        const isBetter =
          nextBid > existingAmt || (nextBid === existingAmt && existingTime !== null && bidTimeMs < existingTime);
        if (!isBetter && nextBid === existingAmt) throw new Error("Tie bid lost (earlier bid wins).");

        const bidRef = doc(collection(db, "trips", tripId, "rooms", room.id, "bids"));
        bidRefPath = bidRef.path;
        debugBidLog("bid_transaction_refs", {
          tripPath: tripRef.path,
          roomPath: roomRef.path,
          bidPath: bidRefPath,
        });
        debugBidLog("bid_payload_core", {
          amount: nextBid,
          bidderUid: uid,
          bidTimeMs,
        });

        const bidCreatePayload = { amount: nextBid, bidderUid: uid, bidTimeMs, createdAt: createdAtTs };
        debugBidLog("bid_create_payload", bidCreatePayload);
        txStage = "write_bid_doc";
        tx.set(bidRef, bidCreatePayload);

        const roomUpdatePayload = {
          currentHighBidAmount: nextBid,
          currentHighBidderUid: uid,
          currentHighBidAt: currentHighBidAtTs,
          currentHighBidTimeMs: bidTimeMs,
        };
        debugBidLog("room_update_payload", roomUpdatePayload);
        txStage = "write_room_high_bid";
        tx.update(roomRef, roomUpdatePayload);

        // anti-sniping extend
        const endAt = t.auctionEndAt;
        if (t.status === "live" && endAt?.toMillis) {
          const endMs = endAt.toMillis();
          const msLeft = endMs - bidTimeMs;
          const maxRuleWindowMs = 10 * 60 * 1000;
          const configuredExtendMs = Math.floor(antiExt) * 60 * 1000;
          const extendMs = Math.min(maxRuleWindowMs, configuredExtendMs);
          const nextEndMs = endMs + extendMs;

          // Guard trip write so bids still work even when anti-snipe config is out-of-bounds.
          if (
            msLeft >= 0 &&
            msLeft <= maxRuleWindowMs &&
            extendMs > 0 &&
            nextEndMs > endMs &&
            nextEndMs <= endMs + maxRuleWindowMs
          ) {
            attemptedAntiSnipeUpdate = true;
            pendingAntiSnipeEndAt = new Date(nextEndMs);
            txStage = "queue_trip_anti_snipe";
          }
        }
        txStage = "commit";
      });
      if (pendingAntiSnipeEndAt) {
        try {
          await updateDoc(doc(db, "trips", tripId), { auctionEndAt: pendingAntiSnipeEndAt });
          debugBidLog("bid_anti_snipe_success", { tripPath: tripRefPath, auctionEndAt: pendingAntiSnipeEndAt });
        } catch (antiSnipeErr: unknown) {
          const antiSnipeParsed = extractFirestoreError(antiSnipeErr);
          debugBidLog("bid_anti_snipe_failed", {
            tripPath: tripRefPath,
            code: antiSnipeParsed.code,
            message: antiSnipeParsed.message,
          });
        }
      }
      debugBidLog("bid_transaction_success", {
        tripPath: tripRefPath,
        roomPath: roomRefPath,
        bidPath: bidRefPath,
        attemptedAntiSnipeUpdate,
      });
    } catch (e: unknown) {
      const parsed = extractFirestoreError(e);
      debugBidLog("bid_transaction_failed", {
        tripPath: tripRefPath,
        roomPath: roomRefPath,
        bidPath: bidRefPath,
        attemptedAntiSnipeUpdate,
        stage: txStage,
        code: parsed.code,
        message: parsed.message,
        details: parsed.details,
      });
      const bidFailureContext = `stage=${txStage} uid=${uid} tripStatus=${failureTripStatus} nextBid=${failureNextBid} currentBid=${failureCurrentBid} auctionEnded=${failureAuctionEnded}`;
      debugBidLog("bid_failure_context", { bidFailureContext });
      const bidFailureMessage = `Bid failed [${parsed.code}] at ${txStage}: ${parsed.message}. ${bidFailureContext}`;
      setBidActionError(bidFailureMessage);
      alert(bidFailureMessage);
    } finally {
      setBusyRoomId(null);
    }
  }

  async function copyShareLink(shareUrl: string) {
    if (typeof window === "undefined" || !window.navigator?.clipboard?.writeText) {
      setCopyError("Couldn’t copy — please copy manually");
      setCopyState("idle");
      return;
    }
    try {
      await window.navigator.clipboard.writeText(shareUrl);
      setCopyError(null);
      setCopyState("copied");
    } catch {
      setCopyError("Couldn’t copy — please copy manually");
      setCopyState("idle");
    }
  }

  if (loading) return <main className="page">Auth loading…</main>;
  if (error) return <main className="page">{error}</main>;
  if (!trip) return <main className="page">Loading trip…</main>;

  const countdown =
    trip.status === "live" && remainingMs !== null
      ? remainingMs > 0
        ? formatTime(remainingMs)
        : "00:00:00"
      : null;
  const authReadyUser = auth.currentUser;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const listingStats = [
    formatListingCount(trip.listingBedrooms, "bedroom"),
    formatListingCount(trip.listingBeds, "bed"),
    formatListingCount(trip.listingBaths, "bath"),
  ].filter((value): value is string => Boolean(value));
  const hasListingPreviewData = Boolean(trip.listingImageUrl || trip.listingTitle);
  const shouldShowListingPreviewCard = Boolean(
    hasListingPreviewData || listingStats.length > 0 || trip.listingUrl
  );

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">{trip.name}</h1>
        <p className="hero-subtitle">Live lobby for your room auction.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="pill">Status: {trip.status}</span>
          {trip.status === "live" && countdown ? <span className="pill">Time left: {countdown}</span> : null}
        </div>
      </section>

      <section className="card">
        <div className="section-title">Share link</div>
        <div className="code-block">{shareUrl}</div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="button secondary" onClick={() => copyShareLink(shareUrl)}>
            {copyState === "copied" ? "Copied!" : "Copy link"}
          </button>
        </div>
        {copyError ? (
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            {copyError}
          </p>
        ) : null}
        {trip.listingUrl ? (
          <div style={{ marginTop: 12 }}>
            <a href={trip.listingUrl} target="_blank" rel="noopener noreferrer">
              View listing
            </a>
          </div>
        ) : null}
      </section>

      {isGuestView && (
        <section className="card soft section">
          <div className="notice">Viewing as guest — continue as guest to bid</div>
          {guestActionError ? <p className="muted" style={{ marginTop: 10 }}>{guestActionError}</p> : null}
          {bidAuthError ? <p className="muted" style={{ marginTop: 10 }}>{bidAuthError}</p> : null}
          {bidActionError ? <p className="muted" style={{ marginTop: 10 }}>{bidActionError}</p> : null}
        </section>
      )}

      <section className="card section">
        <div className="section-title">Lobby</div>
        {isGuestView ? (
          <p className="muted">Continue as guest to join and appear in the participant lobby.</p>
        ) : (
          <>
            <div className="row">
              <span className="pill">Participants: {members.length}</span>
              {isManager ? <span className="pill">Manager view</span> : null}
            </div>
            <ul className="list" style={{ marginTop: 12 }}>
              {members.map((m) => (
                <li key={m.uid} className="list-item">
                  <strong>{m.displayName}</strong>
                  <div className="muted">{m.role === "manager" ? "Manager" : "Participant"}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card section">
        <div className="section-title">Auction</div>

        {trip.status === "draft" && <p className="muted">Not started yet.</p>}
        {trip.status === "live" && <p className="muted">Time remaining: <strong>{countdown}</strong></p>}
        {trip.status === "ended" && <p className="muted">Auction ended. See Results for final amounts.</p>}

        {isManager && (
          <div className="row" style={{ marginTop: 10 }}>
            {trip.status === "draft" && (
              <button disabled={busyAdmin} onClick={startAuction} className="button">
                {busyAdmin ? "Working…" : "Start auction"}
              </button>
            )}

            {trip.status === "live" && (
              <>
                <button disabled={busyAdmin} onClick={endAuctionNow} className="button secondary">
                  {busyAdmin ? "Working…" : "End auction now"}
                </button>

                <button disabled={busyAdmin} onClick={restartAuction} className="button ghost">
                  {busyAdmin ? "Working…" : "Restart auction"}
                </button>
              </>
            )}

            {trip.status === "ended" && (
              <>
                <button disabled={busyAdmin} onClick={restartAuction} className="button">
                  {busyAdmin ? "Working…" : "Restart auction"}
                </button>
                <button disabled={busyAdmin} onClick={resetToDraft} className="button ghost">
                  {busyAdmin ? "Working…" : "Reset to draft"}
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {shouldShowListingPreviewCard ? (
        <section className="card section">
          <div className="section-title">Listing preview</div>

          {hasListingPreviewData ? (
            <div style={{ display: "grid", gap: 14 }}>
              {trip.listingImageUrl ? (
                <img
                  src={trip.listingImageUrl}
                  alt={trip.listingTitle || "Listing preview"}
                  style={{
                    width: "100%",
                    maxWidth: 520,
                    borderRadius: 12,
                    border: "1px solid var(--line)",
                    maxHeight: 320,
                    objectFit: "cover",
                  }}
                />
              ) : null}
              <div style={{ display: "grid", gap: 8 }}>
                <strong>{trip.listingTitle || "Listing title unavailable"}</strong>
                {trip.listingUrl ? (
                  <a className="link" href={trip.listingUrl} target="_blank" rel="noopener noreferrer">
                    View full listing
                  </a>
                ) : null}
              </div>
            </div>
          ) : trip.listingUrl ? (
            <div className="notice">Preview unavailable — site blocks scraping</div>
          ) : null}

          {listingStats.length > 0 ? (
            <div className="row" style={{ marginTop: 12 }}>
              {listingStats.map((value) => (
                <span key={value} className="pill">
                  {value}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card section">
        <div className="section-title">Rooms</div>
        {bidAuthError ? <p className="muted" style={{ marginBottom: 10 }}>{bidAuthError}</p> : null}
        {bidActionError ? <p className="muted" style={{ marginBottom: 10 }}>{bidActionError}</p> : null}
        {rooms.length === 0 ? (
          <p className="muted">No rooms found.</p>
        ) : (
          <ul className="list">
            {rooms.map((r) => {
              const maxAllowed = maxAllowedForRoom(r.id);
              const current = r.currentHighBidAmount || 0;
              const nextBid = current === 0 ? r.startingPrice : current + trip.bidIncrement;

              const highBidderName = leadingBidderLabel(r.currentHighBidderUid);

              const canBid = !!authReadyUser && trip.status === "live" && (endAtMs ? nowMs < endAtMs : true) && nextBid <= maxAllowed;

              return (
                <li key={r.id} className="list-item">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{r.name}</strong>
                    <span className="muted">Sleeps {r.capacity}</span>
                  </div>

                  <div className="muted" style={{ marginTop: 6 }}>
                    Starting ${r.startingPrice} • Current <strong>${current}</strong>
                    {highBidderName ? <span> — leading: {highBidderName}</span> : null}
                  </div>

                  <div className="muted">Max allowed right now: <strong>${maxAllowed}</strong></div>

                  {trip.status !== "ended" ? (
                    authReadyUser ? (
                      <button
                        className="button"
                        style={{ marginTop: 10 }}
                        disabled={!canBid || busyRoomId === r.id}
                        onClick={() => placeBid(r)}
                      >
                        {busyRoomId === r.id ? "Bidding…" : `Bid $${nextBid}`}
                      </button>
                    ) : (
                      <button
                        className="button ghost"
                        style={{ marginTop: 10 }}
                        onClick={continueAsGuest}
                        disabled={busyGuestAuth}
                      >
                        {busyGuestAuth ? "Continuing..." : "Sign in / Continue as guest to bid"}
                      </button>
                    )
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      Winner: <strong>{leadingBidderLabel(r.winnerUid ?? null) ?? "No winner"}</strong>
                      {typeof r.winnerAmount === "number" ? ` — $${r.winnerAmount}` : ""}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="section row" style={{ justifyContent: "space-between" }}>
        <span className="muted">Need the final breakdown?</span>
        <a className="button secondary" href={`/trip/${tripId}/results?code=${trip.inviteCode}`}>
          View results
        </a>
      </div>
    </main>
  );
}
