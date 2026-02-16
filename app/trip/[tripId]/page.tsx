"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { onAuthStateChanged, signInAnonymously, User } from "firebase/auth";
import {
  arrayUnion,
  collection,
  deleteDoc,
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
import { normalizeDisplayName } from "@/src/lib/authGuests";

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

type PricingMode = "equalSplit" | "zero" | "preset" | "firstBid";

type Trip = {
  name: string;
  status: "draft" | "live" | "ended";
  inviteCode: string;
  pricingMode?: PricingMode;
  listingUrl?: string | null;
  listingTitle?: string | null;
  listingImageUrl?: string | null;
  listingDescription?: string | null;
  listingSiteName?: string | null;
  listingPreviewError?: string | null;
  listingPreviewUpdatedAt?: unknown;
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
  bannedUids?: string[];

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

function minIncrementFor(currentHighBidAmount: number) {
  return Math.max(20, Math.ceil(currentHighBidAmount * 0.1));
}

function minAllowedForRoom(room: Room) {
  const current = Number(room.currentHighBidAmount ?? 0);
  const starting = Number(room.startingPrice ?? 0);
  return current === 0 ? Math.max(starting, 20) : current + minIncrementFor(current);
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
const GUEST_BIDDER_NAME_KEY = "bidroom_guest_bidder_name";

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

  const { user, loading, preferredDisplayName } = useAuth();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [busyRoomId, setBusyRoomId] = useState<string | null>(null);
  const [bidInputs, setBidInputs] = useState<Record<string, string>>({});
  const [busyAdmin, setBusyAdmin] = useState(false);
  const [removingMemberUid, setRemovingMemberUid] = useState<string | null>(null);
  const [bidActionError, setBidActionError] = useState<string | null>(null);
  const [memberActionNotice, setMemberActionNotice] = useState<string | null>(null);
  const [busyGuestJoin, setBusyGuestJoin] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [copyError, setCopyError] = useState<string | null>(null);
  const [bidAuthUser, setBidAuthUser] = useState<User | null>(() => auth.currentUser);

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
    const initialUser = auth.currentUser;
    setBidAuthUser(initialUser);
    debugBidLog("bid_auth_state", {
      hasAuthUser: !!initialUser,
      uid: initialUser?.uid ?? null,
      isAnonymous: initialUser?.isAnonymous ?? false,
    });
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setBidAuthUser(nextUser);
      debugBidLog("bid_auth_state", {
        hasAuthUser: !!nextUser,
        uid: nextUser?.uid ?? null,
        isAnonymous: nextUser?.isAnonymous ?? false,
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (rooms.length === 0) {
      setBidInputs((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    setBidInputs((prev) => {
      const next: Record<string, string> = {};
      let changed = false;

      for (const room of rooms) {
        const minAllowed = minAllowedForRoom(room);
        const priorRaw = prev[room.id];
        const parsedPrior = Number(priorRaw);
        const keepPrior = typeof priorRaw === "string" && priorRaw.trim() !== "" && Number.isFinite(parsedPrior) && parsedPrior >= minAllowed;
        const nextValue = keepPrior ? priorRaw : String(minAllowed);
        next[room.id] = nextValue;
        if (nextValue !== priorRaw) changed = true;
      }

      if (!changed && Object.keys(prev).length !== rooms.length) changed = true;
      return changed ? next : prev;
    });
  }, [rooms]);

  const isManager = useMemo(() => !!(user && trip && user.uid === trip.createdByUid), [user, trip]);
  const isBannedUser = useMemo(() => {
    if (!bidAuthUser || !trip || !Array.isArray(trip.bannedUids)) return false;
    return trip.bannedUids.includes(bidAuthUser.uid);
  }, [bidAuthUser, trip]);

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
    if (!bidAuthUser) return "Participant";
    if (memberNameByUid[uid]) return memberNameByUid[uid];
    if (bidAuthUser.uid === uid) return preferredDisplayName;
    return "Participant";
  }

  function maxAllowedForRoom(roomId: string) {
    if (!trip) return 0;
    const sumOther = rooms.reduce((sum, r) => (r.id === roomId ? sum : sum + (r.currentHighBidAmount || 0)), 0);
    return Math.max(0, trip.totalPrice - sumOther);
  }

  function getStoredGuestBidderName() {
    if (typeof window === "undefined") return null;
    return normalizeDisplayName(window.localStorage.getItem(GUEST_BIDDER_NAME_KEY) ?? "");
  }

  function setStoredGuestBidderName(displayName: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(GUEST_BIDDER_NAME_KEY, displayName);
  }

  async function upsertMemberProfile(memberUid: string, displayName: string, createdByUid: string) {
    await setDoc(
      doc(db, "trips", tripId, "members", memberUid),
      {
        displayName,
        role: memberUid === createdByUid ? "manager" : "participant",
        joinedAt: Timestamp.now(),
      },
      { merge: false }
    );
  }

  async function ensureBidderSession() {
    if (!trip) return null;

    let currentUser = auth.currentUser;
    debugBidLog("auth_currentUser_before_join", {
      uid: currentUser?.uid ?? null,
      isAnonymous: currentUser?.isAnonymous ?? false,
    });
    if (currentUser && !currentUser.isAnonymous) {
      return currentUser.uid;
    }

    const existingAnonName = currentUser ? normalizeDisplayName(memberNameByUid[currentUser.uid] ?? "") : null;
    const seededName = existingAnonName ?? getStoredGuestBidderName();
    let chosenName = seededName;

    if (!currentUser || !chosenName) {
      const promptedName = window.prompt("Enter your name to join bidding", seededName ?? "");
      if (promptedName === null) return null;
      const normalized = normalizeDisplayName(promptedName);
      if (!normalized) {
        alert("Name must be 2–24 characters.");
        return null;
      }
      chosenName = normalized;
    }

    debugBidLog("guest_join_start", { tripId, name: chosenName });

    try {
      if (!currentUser) {
        const credential = await signInAnonymously(auth);
        currentUser = credential.user ?? auth.currentUser;
      }

      if (!currentUser) throw new Error("Could not create an anonymous session.");
      await currentUser.getIdToken();
      const memberRef = doc(db, "trips", tripId, "members", currentUser.uid);
      const memberPayload = {
        displayName: chosenName,
        role: "participant" as const,
        joinedAt: Timestamp.now(),
      };
      debugBidLog("member_write_payload", {
        displayName: memberPayload.displayName,
        role: memberPayload.role,
        joinedAtType: "timestamp",
      });
      try {
        await setDoc(memberRef, memberPayload, { merge: false });
      } catch (memberWriteErr: unknown) {
        const memberParsed = extractFirestoreError(memberWriteErr);
        debugBidLog("member_write_error", {
          code: memberParsed.code,
          message: memberParsed.message,
        });
        throw memberWriteErr;
      }
      setStoredGuestBidderName(chosenName);
      setBidAuthUser(currentUser);
      debugBidLog("guest_join_success", { uid: currentUser.uid, displayName: chosenName });
      return currentUser.uid;
    } catch (err: unknown) {
      const parsed = extractFirestoreError(err);
      debugBidLog("guest_join_failed", { code: parsed.code, message: parsed.message });
      const message = `Could not join bidding [${parsed.code}]: ${parsed.message}`;
      setBidActionError(message);
      alert(message);
      return null;
    }
  }

  async function continueToBid(roomId?: string) {
    debugBidLog("bid_click", { roomId: roomId ?? "unknown" });
    setBidActionError(null);
    setBusyGuestJoin(true);
    try {
      await ensureBidderSession();
    } finally {
      setBusyGuestJoin(false);
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
        const bannedAtLoad =
          Array.isArray(data.bannedUids) &&
          data.bannedUids.some((bannedUid: unknown) => bannedUid === user.uid);
        if (!bannedAtLoad) {
          const storedAnonName = user.isAnonymous ? getStoredGuestBidderName() : null;
          const memberDisplayName = user.isAnonymous
            ? storedAnonName
            : normalizeDisplayName(preferredDisplayName) ?? "Participant";
          if (memberDisplayName) {
            try {
              await upsertMemberProfile(user.uid, memberDisplayName, data.createdByUid);
            } catch (joinError) {
              console.warn("[trip] member upsert skipped", joinError);
            }
          }
        }

        if (!user.isAnonymous) {
          await setDoc(
            doc(db, "users", user.uid, "myTrips", tripId),
            {
              tripId,
              inviteCode: typeof data.inviteCode === "string" ? data.inviteCode : "",
              name: typeof data.name === "string" ? data.name : "Untitled trip",
              status: data.status === "live" || data.status === "ended" ? data.status : "draft",
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      }

      unsubTrip = onSnapshot(
        tripRef,
        (s) => {
          const t = s.data() as any;
          const bannedUids = Array.isArray(t.bannedUids)
            ? t.bannedUids.filter((uid: unknown) => typeof uid === "string")
            : [];
          setTrip({ ...t, status: (t.status ?? "draft") as any, bannedUids });
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
    }

    if (!loading) boot().catch((e: any) => setError(e?.message ?? "Failed to load"));

    return () => {
      if (unsubTrip) unsubTrip();
      if (unsubRooms) unsubRooms();
      if (unsubMembers) unsubMembers();
    };
  }, [tripId, inviteCode, user, loading, preferredDisplayName]);

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

  async function removeParticipant(member: Member) {
    if (!trip || !isManager || !user) return;
    if (member.uid === user.uid || member.role === "manager") return;

    const ok = window.confirm(`Remove ${member.displayName} from bidding?`);
    if (!ok) return;

    setRemovingMemberUid(member.uid);
    setMemberActionNotice(null);
    try {
      await updateDoc(doc(db, "trips", tripId), {
        bannedUids: arrayUnion(member.uid),
      });
      await deleteDoc(doc(db, "trips", tripId, "members", member.uid));
      setMemberActionNotice(`${member.displayName} was removed from bidding.`);
    } catch (e: any) {
      setMemberActionNotice(e?.message ?? "Could not remove participant.");
    } finally {
      setRemovingMemberUid(null);
    }
  }

  // ---------- Bidding ----------
  async function placeBid(room: Room) {
    if (!trip) return;
    debugBidLog("bid_click", { roomId: room.id });
    if (isBannedUser) {
      setBidActionError("You've been removed from bidding by the manager.");
      return;
    }

    const typedBidInput = bidInputs[room.id] ?? String(minAllowedForRoom(room));
    const parsedTypedBid = Number(typedBidInput);
    if (!Number.isFinite(parsedTypedBid) || !Number.isInteger(parsedTypedBid)) {
      setBidActionError("Bid amount must be a whole-dollar number.");
      return;
    }
    if (parsedTypedBid < 0) {
      setBidActionError("Bid amount must be $0 or greater.");
      return;
    }
    const typedBid = parsedTypedBid;

    const uid = await ensureBidderSession();
    if (!uid) return;
    const authUser = auth.currentUser;
    debugBidLog("bid_auth_check", {
      uid,
      isAnonymous: authUser?.isAnonymous ?? false,
      hasCurrentUser: !!authUser,
    });
    const optimisticCurrent = Number(room.currentHighBidAmount ?? 0);
    const optimisticMinIncrement = minIncrementFor(optimisticCurrent);
    const optimisticMinAllowed = minAllowedForRoom(room);
    const optimisticMaxAllowed = maxAllowedForRoom(room.id);
    const localEndRaw = trip.auctionEndAt ?? null;
    const localEndMs =
      localEndRaw && typeof localEndRaw.toMillis === "function"
        ? localEndRaw.toMillis()
        : localEndRaw
          ? new Date(localEndRaw).getTime()
          : null;
    const localAuctionLiveNow = trip.status === "live" && (localEndMs === null || nowMs <= localEndMs);
    debugBidLog("bid_preflight", {
      uid,
      isAnonymous: authUser?.isAnonymous ?? false,
      tripId,
      roomId: room.id,
      amount: typedBid,
      computedNextBid: typedBid,
      minAllowed: optimisticMinAllowed,
      maxAllowed: optimisticMaxAllowed,
    });
    debugBidLog("bid_rule_snapshot_pre_tx", {
      authUid: uid,
      tripStatus: trip.status,
      tripAuctionEndAtRaw: localEndRaw,
      tripAuctionEndAtMs: localEndMs,
      auctionLiveNow: localAuctionLiveNow,
      roomCurrentHighBidAmount: optimisticCurrent,
      roomStartingPrice: room.startingPrice ?? 0,
      computedMinIncrement: optimisticMinIncrement,
      computedMinAllowed: optimisticMinAllowed,
      typedBid,
      bidGtCurrent: typedBid > optimisticCurrent,
    });
    setBidActionError(null);

    if (trip.status !== "live") return alert("Auction is not live yet.");
    if (endAtMs && nowMs >= endAtMs) return alert("Auction has ended.");
    if (typedBid < optimisticMinAllowed) {
      setBidActionError(`Bid must be at least $${optimisticMinAllowed}.`);
      return;
    }
    if (typedBid > trip.totalPrice) {
      setBidActionError("Bid cannot exceed total trip price.");
      return;
    }

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
      tripPath: tripRefPath,
      roomPath: roomRefPath,
      bidPayload: {
        amount: typedBid,
        bidderUid: uid,
        bidTimeMs: bidTimeMsPreview,
        createdAt: createdAtPreview,
      },
      roomPayload: {
        currentHighBidAmount: typedBid,
        currentHighBidderUid: uid,
        currentHighBidAt: currentHighBidAtPreview,
        currentHighBidTimeMs: bidTimeMsPreview,
      },
    });
    debugBidLog("bid_tx_paths", { tripPath: tripRefPath, roomPath: roomRefPath, bidPath: null });
    let bidRefPath: string | null = null;
    let txStage = "start";
    let attemptedAntiSnipeUpdate = false;
    let pendingAntiSnipeEndAt: Date | null = null;
    let failureTripStatus: string = trip.status;
    let failureCurrentBid = room.currentHighBidAmount ?? 0;
    let failureAttemptedBid = typedBid;
    let failureAuctionEnded = !!(endAtMs && nowMs >= endAtMs);

    try {
      if (DEBUG_BIDS) {
        const memberRef = doc(db, "trips", tripId, "members", uid);
        const memberSnap = await getDoc(memberRef);
        debugBidLog("bid_user_context", {
          uid,
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
        const otherRoomRefs = rooms
          .filter((rr) => rr.id !== room.id)
          .map((rr) => doc(db, "trips", tripId, "rooms", rr.id));

        const tripSnap = await tx.get(tripRef);
        const roomSnap = await tx.get(roomRef);
        const otherRoomSnaps = await Promise.all(otherRoomRefs.map((ref) => tx.get(ref)));
        if (!tripSnap.exists() || !roomSnap.exists()) throw new Error("Missing trip/room");

        const t = tripSnap.data() as any;
        const r = roomSnap.data() as any;
        const txNowMs = Date.now();

        const totalPrice = Number(t.totalPrice ?? 0);
        const antiExt = Number(t.antiSnipeExtendMinutes ?? 10);
        const txEndRaw = t.auctionEndAt ?? null;
        const txEndMs = txEndRaw && typeof txEndRaw.toMillis === "function" ? txEndRaw.toMillis() : null;
        const txAuctionLiveNow = t.status === "live" && (txEndMs === null || txNowMs <= txEndMs);

        const current = Number(r.currentHighBidAmount ?? 0);
        const starting = Number(r.startingPrice ?? 0);
        const minIncrement = minIncrementFor(current);
        const minAllowed = current === 0 ? Math.max(starting, 20) : current + minIncrement;

        failureTripStatus = String(t.status ?? "unknown");
        failureCurrentBid = current;
        failureAttemptedBid = typedBid;
        failureAuctionEnded = txEndMs !== null ? txNowMs > txEndMs : false;

        debugBidLog("bid_rule_snapshot_tx", {
          authUid: uid,
          tripStatus: t.status ?? null,
          tripAuctionEndAtRaw: txEndRaw,
          tripAuctionEndAtMs: txEndMs,
          auctionLiveNow: txAuctionLiveNow,
          roomCurrentHighBidAmount: current,
          roomStartingPrice: starting,
          computedMinIncrement: minIncrement,
          computedMinAllowed: minAllowed,
          typedBid,
          bidGtCurrent: typedBid > current,
        });

        const sumOther = otherRoomSnaps.reduce((sum, roomSnapDoc) => {
          if (!roomSnapDoc.exists()) return sum;
          const roomData = roomSnapDoc.data() as any;
          return sum + Number(roomData.currentHighBidAmount ?? 0);
        }, 0);
        const maxAllowed = Math.max(0, totalPrice - sumOther);

        if (typedBid < minAllowed) throw new Error(`Bid must be at least $${minAllowed}.`);
        if (typedBid > totalPrice) throw new Error("Bid cannot exceed total trip price.");
        if (typedBid > maxAllowed) throw new Error(`Bid too high. Max allowed for this room is $${maxAllowed}.`);

        const bidTimeMs = Date.now();
        const createdAtTs = Timestamp.now();
        const currentHighBidAtTs = Timestamp.now();
        // tie-break earliest wins
        const existingAmt = Number(r.currentHighBidAmount ?? 0);
        const existingTime = typeof r.currentHighBidTimeMs === "number" ? r.currentHighBidTimeMs : null;
        const existingBidderUid = typeof r.currentHighBidderUid === "string" ? r.currentHighBidderUid : null;
        const isInitialZeroState = existingAmt === 0 && !existingBidderUid;
        const isBetter =
          typedBid > existingAmt ||
          (typedBid === existingAmt &&
            ((existingTime !== null && bidTimeMs < existingTime) || isInitialZeroState));
        if (!isBetter && typedBid === existingAmt) throw new Error("Tie bid lost (earlier bid wins).");

        const bidRef = doc(collection(db, "trips", tripId, "rooms", room.id, "bids"));
        bidRefPath = bidRef.path;
        debugBidLog("bid_transaction_refs", {
          tripPath: tripRef.path,
          roomPath: roomRef.path,
          bidPath: bidRefPath,
        });
        debugBidLog("bid_tx_paths", {
          tripPath: tripRef.path,
          roomPath: roomRef.path,
          bidPath: bidRefPath,
        });
        debugBidLog("bid_payload_core", {
          amount: typedBid,
          bidderUid: uid,
          bidTimeMs,
        });

        const bidCreatePayload = { amount: typedBid, bidderUid: uid, bidTimeMs, createdAt: createdAtTs };
        debugBidLog("bid_create_payload", bidCreatePayload);
        txStage = "write_bid_doc";
        tx.set(bidRef, bidCreatePayload);

        const roomUpdatePayload = {
          currentHighBidAmount: typedBid,
          currentHighBidderUid: uid,
          currentHighBidAt: currentHighBidAtTs,
          currentHighBidTimeMs: bidTimeMs,
        };
        debugBidLog("tx_room_path", { roomPath: roomRef.path });
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
      const bidFailureContext = `stage=${txStage} uid=${uid} tripStatus=${failureTripStatus} attemptedBid=${failureAttemptedBid} currentBid=${failureCurrentBid} auctionEnded=${failureAuctionEnded}`;
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
  const authReadyUser = bidAuthUser;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const listingStats = [
    formatListingCount(trip.listingBedrooms, "bedroom"),
    formatListingCount(trip.listingBeds, "bed"),
    formatListingCount(trip.listingBaths, "bath"),
  ].filter((value): value is string => Boolean(value));
  let listingHostname: string | null = null;
  if (trip.listingUrl) {
    try {
      listingHostname = new URL(trip.listingUrl).hostname;
    } catch {
      listingHostname = null;
    }
  }
  const listingDescription =
    typeof trip.listingDescription === "string" && trip.listingDescription.trim()
      ? trip.listingDescription.trim()
      : null;
  const hasListingPreviewData = Boolean(
    trip.listingImageUrl || trip.listingTitle || trip.listingSiteName || listingDescription
  );
  const hasListingStats = listingStats.length > 0;
  const listingPreviewError =
    typeof trip.listingPreviewError === "string" && trip.listingPreviewError.trim()
      ? trip.listingPreviewError.trim()
      : null;
  const listingPreviewLoading = Boolean(
    trip.listingUrl &&
      !hasListingPreviewData &&
      !hasListingStats &&
      !listingPreviewError
  );
  const shouldShowListingPreviewCard = Boolean(
    hasListingPreviewData || hasListingStats || trip.listingUrl
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

      {isBannedUser ? (
        <section className="card section">
          <p className="notice">You've been removed from bidding by the manager.</p>
        </section>
      ) : null}

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

      <section className="card section">
        <div className="section-title">Lobby</div>
        <div className="row">
          <span className="pill">Participants: {members.length}</span>
          {isManager ? <span className="pill">Manager view</span> : null}
        </div>
        {memberActionNotice ? (
          <p className="notice" style={{ marginTop: 12 }}>
            {memberActionNotice}
          </p>
        ) : null}
        <ul className="list" style={{ marginTop: 12 }}>
          {members.map((m) => (
            <li key={m.uid} className="list-item">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{authReadyUser ? m.displayName : "Participant"}</strong>
                  <div className="muted">{m.role === "manager" ? "Manager" : "Participant"}</div>
                </div>
                {isManager && m.role !== "manager" && m.uid !== user?.uid ? (
                  <button
                    className="button secondary"
                    onClick={() => removeParticipant(m)}
                    disabled={removingMemberUid === m.uid}
                  >
                    {removingMemberUid === m.uid ? "Removing…" : "Remove"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
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
                {(trip.listingSiteName || listingHostname) ? (
                  <div className="muted">{trip.listingSiteName || listingHostname}</div>
                ) : null}
                {listingDescription ? (
                  <div className="muted">
                    {listingDescription.length > 260
                      ? `${listingDescription.slice(0, 257)}...`
                      : listingDescription}
                  </div>
                ) : null}
                {trip.listingUrl ? (
                  <a className="link" href={trip.listingUrl} target="_blank" rel="noopener noreferrer">
                    View full listing
                  </a>
                ) : null}
              </div>
            </div>
          ) : listingPreviewLoading ? (
            <div className="notice">Loading listing preview…</div>
          ) : trip.listingUrl ? (
            <div className="notice">Preview unavailable — site blocks scraping</div>
          ) : null}

          {hasListingStats ? (
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
        {bidActionError ? <p className="muted" style={{ marginBottom: 10 }}>{bidActionError}</p> : null}
        {isBannedUser ? (
          <p className="notice" style={{ marginBottom: 10 }}>
            You've been removed from bidding by the manager.
          </p>
        ) : null}
        {!authReadyUser ? (
          <p className="muted" style={{ marginBottom: 10 }}>
            Enter a display name to join bidding.
          </p>
        ) : null}
        {!authReadyUser && !isBannedUser ? (
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="button" disabled={busyGuestJoin} onClick={() => continueToBid()}>
              {busyGuestJoin ? "Joining…" : "Continue to bid"}
            </button>
          </div>
        ) : null}
        {rooms.length === 0 ? (
          <p className="muted">No rooms found.</p>
        ) : (
          <ul className="list">
            {rooms.map((r) => {
              const maxAllowed = maxAllowedForRoom(r.id);
              const current = r.currentHighBidAmount || 0;
              const minNextBid = minAllowedForRoom(r);
              const minIncrement = minIncrementFor(current);
              const bidValue = bidInputs[r.id] ?? String(minNextBid);
              const bidValueNumber = Number(bidValue);
              const hasValidBidValue =
                Number.isFinite(bidValueNumber) &&
                Number.isInteger(bidValueNumber) &&
                bidValueNumber >= minNextBid &&
                bidValueNumber <= Math.min(maxAllowed, trip.totalPrice);
              const bidInputMax = Math.min(maxAllowed, trip.totalPrice);

              const highBidderName = leadingBidderLabel(r.currentHighBidderUid);

              const canBid =
                !!authReadyUser &&
                !isBannedUser &&
                trip.status === "live" &&
                (endAtMs ? nowMs < endAtMs : true) &&
                hasValidBidValue;

              return (
                <li key={r.id} className="list-item">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{r.name}</strong>
                    <span className="muted">Sleeps {r.capacity}</span>
                  </div>

                  <div className="muted" style={{ marginTop: 6 }}>
                    Current high bid: <strong>${current}</strong>
                    {highBidderName ? <span> — leading: {highBidderName}</span> : null}
                  </div>

                  <div className="muted">Min next bid: <strong>${minNextBid}</strong></div>
                  <div className="muted">Max allowed for this room right now: <strong>${maxAllowed}</strong></div>
                  {current > 0 ? (
                    <div className="muted" style={{ marginTop: 4 }}>
                      Minimum increment right now: <strong>${minIncrement}</strong>
                    </div>
                  ) : (
                    <div className="muted" style={{ marginTop: 4 }}>
                      Starting price: <strong>${r.startingPrice}</strong>
                    </div>
                  )}

                  {trip.status !== "ended" ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {!isBannedUser ? (
                        <>
                          <label className="label" style={{ margin: 0 }}>
                            Bid amount ($)
                            <input
                              className="input"
                              type="number"
                              min={minNextBid}
                              max={bidInputMax}
                              step={1}
                              value={bidValue}
                              onChange={(e) => {
                                const nextValue = e.target.value;
                                setBidInputs((prev) => ({ ...prev, [r.id]: nextValue }));
                              }}
                              disabled={!authReadyUser || trip.status !== "live" || (endAtMs ? nowMs >= endAtMs : false) || busyRoomId === r.id || busyGuestJoin}
                            />
                          </label>
                          {authReadyUser ? (
                            <button
                              className="button"
                              disabled={!canBid || busyRoomId === r.id || busyGuestJoin}
                              onClick={() => {
                                placeBid(r);
                              }}
                            >
                              {busyRoomId === r.id ? "Bidding…" : "Place bid"}
                            </button>
                          ) : (
                            <div className="muted">Click “Continue to bid” above to join bidding.</div>
                          )}
                        </>
                      ) : (
                        <div className="muted">Bidding disabled for removed participants.</div>
                      )}
                    </div>
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
        <div className="row">
          {isManager ? (
            <a className="button ghost" href={`/trip/${tripId}/settings?code=${encodeURIComponent(trip.inviteCode)}`}>
              Trip settings
            </a>
          ) : null}
          <a className="button secondary" href={`/trip/${tripId}/results?code=${trip.inviteCode}`}>
            View results
          </a>
        </div>
      </div>
    </main>
  );
}
