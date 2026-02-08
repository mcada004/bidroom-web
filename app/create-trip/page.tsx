"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { getPreferredDisplayName } from "@/src/lib/authGuests";

function makeInviteCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

type FirestoreLikeError = {
  code?: string;
  message?: string;
};

function extractFirestoreError(err: unknown) {
  const asObj = (err ?? {}) as FirestoreLikeError;
  return {
    code: typeof asObj.code === "string" ? asObj.code : "unknown",
    message: typeof asObj.message === "string" ? asObj.message : "Unknown Firestore error",
  };
}

export default function CreateTripPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [tripName, setTripName] = useState("New Trip");
  const [listingUrl, setListingUrl] = useState("");
  const [totalPrice, setTotalPrice] = useState<number>(2000);
  const [roomCount, setRoomCount] = useState<number>(4);
  const [durationHours, setDurationHours] = useState<number>(24);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseListingUrlOrNull(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const value =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("Listing link must be a valid URL starting with http:// or https://");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Listing link must start with http:// or https://");
    }

    return parsed.toString();
  }

  async function createTrip() {
    if (!user) return;

    setBusy(true);
    setError(null);

    const P = Number(totalPrice);
    const N = Number(roomCount);
    let listingUrlValue: string | null = null;
    try {
      const raw = (listingUrl ?? "").trim();
      listingUrlValue = raw.length === 0 ? null : parseListingUrlOrNull(raw);
    } catch (err) {
      const parsed = extractFirestoreError(err);
      setBusy(false);
      setError(parsed.message);
      return;
    }

    if (!P || P <= 0) {
      setBusy(false);
      setError("Total trip price must be > 0");
      return;
    }
    if (!N || N < 1) {
      setBusy(false);
      setError("Room count must be at least 1");
      return;
    }

    const activeUser = auth.currentUser;
    if (!activeUser?.uid) {
      setBusy(false);
      setError("Not signed in (auth.currentUser missing)");
      return;
    }

    const uid = activeUser.uid;
    const inviteCode = makeInviteCode(6);
    const startingPricePerRoom = Math.ceil(P / N);
    const normalizedTripName = tripName.trim() || "New Trip";
    let createdTripId: string | null = null;

    // STEP 1: create trip doc + manager membership + user index.
    try {
      const payload = {
        name: normalizedTripName,
        createdByUid: uid,
        status: "draft",
        inviteCode,
        listingTitle: null,
        listingImageUrl: null,
        listingBedrooms: null,
        listingBeds: null,
        listingBaths: null,

        totalPrice: P,
        roomCount: N,
        startingPricePerRoom,

        // bidding rules
        bidIncrement: 20,
        auctionDurationHours: Number(durationHours) || 24,
        antiSnipeWindowMinutes: 10,
        antiSnipeExtendMinutes: 10,
        maxRoomsPerUser: 1,

        createdAt: serverTimestamp(),
      } as Record<string, unknown>;

      if (listingUrlValue) {
        payload.listingUrl = listingUrlValue;
      }

      const writeUser = auth.currentUser;
      if (!writeUser?.uid) {
        setError("Not signed in (auth.currentUser missing)");
        setBusy(false);
        return;
      }
      payload.createdByUid = writeUser.uid;

      console.log("[createTrip] auth snapshot", {
        projectId: auth.app.options.projectId,
        uid: auth.currentUser?.uid ?? null,
        isAnonymous: auth.currentUser?.isAnonymous ?? null,
      });
      console.log("[createTrip] payload", payload);

      const tripRef = await addDoc(collection(db, "trips"), payload);

      createdTripId = tripRef.id;

      const userIndexBatch = writeBatch(db);
      userIndexBatch.set(doc(db, "trips", createdTripId, "members", uid), {
        displayName: getPreferredDisplayName(activeUser),
        role: "manager",
        joinedAt: serverTimestamp(),
      });
      userIndexBatch.set(doc(db, "users", uid, "myTrips", createdTripId), {
        tripId: createdTripId,
        inviteCode,
        name: normalizedTripName,
        status: "draft",
        updatedAt: serverTimestamp(),
      });
      await userIndexBatch.commit();
    } catch (err) {
      const parsed = extractFirestoreError(err);
      console.error("[createTrip] trip_create failed", { code: parsed.code, message: parsed.message });
      setError(`trip_create failed [${parsed.code}]: ${parsed.message}`);
      setBusy(false);
      return;
    }
    if (!createdTripId) {
      setError("trip_create failed [unknown]: Missing trip id after creation");
      setBusy(false);
      return;
    }
    const tripId = createdTripId;

    // STEP 2: create rooms after trip doc exists.
    try {
      const roomsBatch = writeBatch(db);
      for (let i = 1; i <= N; i++) {
        const roomDoc = doc(collection(db, "trips", tripId, "rooms"));
        roomsBatch.set(roomDoc, {
          name: `Room ${i}`,
          capacity: 2,
          description: "",
          createdAt: serverTimestamp(),

          startingPrice: startingPricePerRoom, // first bid must be >= this
          currentHighBidAmount: 0,
          currentHighBidderUid: null,
          currentHighBidAt: null,

          winnerUid: null,
        });
      }
      await roomsBatch.commit();
    } catch (err) {
      const parsed = extractFirestoreError(err);
      console.error("[createTrip] rooms_create failed", { code: parsed.code, message: parsed.message });
      setError(`rooms_create failed [${parsed.code}]: ${parsed.message}`);
      setBusy(false);
      return;
    }

    try {
      router.push(`/trip/${tripId}?code=${inviteCode}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Please sign in.</main>;

  const startingPrice = Math.ceil((totalPrice || 0) / Math.max(1, roomCount || 1));

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">Create a new trip</h1>
        <p className="hero-subtitle">
          Define the total cost, number of rooms, and the auction length. We’ll generate rooms automatically.
        </p>
      </section>

      <section className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="stack">
          <label className="label">
            Trip name
            <input className="input" value={tripName} onChange={(e) => setTripName(e.target.value)} />
          </label>

          <label className="label">
            Listing link (Airbnb/VRBO/etc)
            <input
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={listingUrl}
              onChange={(e) => setListingUrl(e.target.value)}
            />
          </label>

          <label className="label">
            Total trip price ($)
            <input
              className="input"
              value={totalPrice}
              onChange={(e) => setTotalPrice(Number(e.target.value))}
              type="number"
              min={1}
            />
          </label>

          <label className="label">
            Number of rooms
            <input
              className="input"
              value={roomCount}
              onChange={(e) => setRoomCount(Number(e.target.value))}
              type="number"
              min={1}
            />
          </label>

          <label className="label">
            Auction duration (hours)
            <input
              className="input"
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
              type="number"
              min={1}
            />
          </label>

          <div className="notice">
            Starting price per room (auto): <strong>${startingPrice}</strong>
          </div>

          <div className="row">
            <button className="button" onClick={createTrip} disabled={busy}>
              {busy ? "Creating…" : "Create trip"}
            </button>
            <Link className="button ghost" href="/">
              Back home
            </Link>
          </div>

          {error && <p className="notice">{error}</p>}
        </div>
      </section>
    </main>
  );
}
