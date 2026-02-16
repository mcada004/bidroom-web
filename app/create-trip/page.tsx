"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
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

type PricingMode = "equalSplit" | "zero" | "preset" | "firstBid";

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
  const [pricingMode, setPricingMode] = useState<PricingMode>("equalSplit");
  const [presetStartingPrices, setPresetStartingPrices] = useState<number[]>(() =>
    Array.from({ length: 4 }, () => 0)
  );
  const [durationHours, setDurationHours] = useState<number>(24);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const count = Math.max(1, Number(roomCount) || 1);
    setPresetStartingPrices((prev) => {
      const next = Array.from({ length: count }, (_, index) => {
        const raw = Number(prev[index] ?? 0);
        if (!Number.isFinite(raw) || raw < 0) return 0;
        return Math.round(raw);
      });
      if (next.length === prev.length && next.every((value, index) => value === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [roomCount]);

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

    const inviteCode = makeInviteCode(6);
    const equalSplitStartingPrice = Math.round(P / N);
    const presetValues = Array.from({ length: N }, (_, index) => {
      const raw = Number(presetStartingPrices[index] ?? 0);
      if (!Number.isFinite(raw)) return 0;
      return raw;
    });
    if (pricingMode === "preset") {
      const invalidIndex = presetValues.findIndex((value) => value < 0);
      if (invalidIndex >= 0) {
        setBusy(false);
        setError(`Room ${invalidIndex + 1} preset must be 0 or greater`);
        return;
      }
    }
    const roomStartingPrices = Array.from({ length: N }, (_, index) => {
      if (pricingMode === "zero") return 0;
      if (pricingMode === "firstBid") return 0;
      if (pricingMode === "preset") return Math.round(presetValues[index] ?? 0);
      return equalSplitStartingPrice;
    });
    const startingPricePerRoom = equalSplitStartingPrice;
    const normalizedTripName = tripName.trim() || "New Trip";
    const payload = {
      name: normalizedTripName,
      status: "draft",
      inviteCode,
      pricingMode,
      listingTitle: null,
      listingImageUrl: null,
      listingDescription: null,
      listingSiteName: null,
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

    const payloadTypes = Object.fromEntries(
      Object.entries(payload).map(([key, value]) => {
        const valueType =
          value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
        return [key, valueType];
      })
    );

    console.log("[createTrip] trip_create preflight", {
      uid: auth.currentUser?.uid ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      projectId: db.app.options.projectId,
      payloadKeys: Object.keys(payload),
      payloadTypes,
    });

    let tripId = "";
    try {
      const tripRef = await addDoc(collection(db, "trips"), payload);
      tripId = tripRef.id;
    } catch (err) {
      const parsed = extractFirestoreError(err);
      console.error("[createTrip] trip_create failed", { code: parsed.code, message: parsed.message });
      setError(`trip_create failed [${parsed.code}]: ${parsed.message}`);
      setBusy(false);
      return;
    }

    // STEP 2: create creator membership after trip doc exists.
    try {
      await setDoc(doc(db, "trips", tripId, "members", writeUser.uid), {
        displayName: getPreferredDisplayName(writeUser),
        role: "manager",
        joinedAt: serverTimestamp(),
      });
    } catch (err) {
      const parsed = extractFirestoreError(err);
      console.error("[createTrip] membership_create failed", { code: parsed.code, message: parsed.message });
      setError(`membership_create failed [${parsed.code}]: ${parsed.message}`);
      setBusy(false);
      return;
    }

    // STEP 3: create rooms after trip doc exists.
    try {
      const roomsBatch = writeBatch(db);
      for (let i = 1; i <= N; i++) {
        const roomDoc = doc(collection(db, "trips", tripId, "rooms"));
        roomsBatch.set(roomDoc, {
          name: `Room ${i}`,
          capacity: 2,
          description: "",
          createdAt: serverTimestamp(),

          startingPrice: roomStartingPrices[i - 1] ?? 0, // first bid must be >= this
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

    // Non-blocking index write: useful for My Trips when rules include /users/{uid}/myTrips.
    try {
      await setDoc(doc(db, "users", writeUser.uid, "myTrips", tripId), {
        tripId,
        inviteCode,
        name: normalizedTripName,
        status: "draft",
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      const parsed = extractFirestoreError(err);
      console.warn("[createTrip] user_index_create failed", { code: parsed.code, message: parsed.message });
    }

    try {
      router.push(`/trip/${tripId}?code=${inviteCode}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Please sign in.</main>;

  const safeRoomCount = Math.max(1, Number(roomCount) || 1);
  const equalSplitStartingPrice = Math.round((Number(totalPrice) || 0) / safeRoomCount);
  const roomStartingPreview = Array.from({ length: safeRoomCount }, (_, index) => {
    if (pricingMode === "zero") return 0;
    if (pricingMode === "firstBid") return 0;
    if (pricingMode === "preset") {
      const raw = Number(presetStartingPrices[index] ?? 0);
      if (!Number.isFinite(raw) || raw < 0) return 0;
      return Math.round(raw);
    }
    return equalSplitStartingPrice;
  });

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
            Pricing mode
            <select
              className="input"
              value={pricingMode}
              onChange={(e) => setPricingMode(e.target.value as PricingMode)}
            >
              <option value="equalSplit">Equal split (default)</option>
              <option value="zero">Set all to 0</option>
              <option value="preset">Preset per-room starting prices</option>
              <option value="firstBid">Prices based off first bid</option>
            </select>
          </label>

          {pricingMode === "preset" ? (
            <div className="stack" style={{ gap: 10 }}>
              {Array.from({ length: safeRoomCount }).map((_, index) => (
                <label className="label" key={`preset-room-${index + 1}`}>
                  Room {index + 1} starting price ($)
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={1}
                    value={presetStartingPrices[index] ?? 0}
                    onChange={(e) => {
                      const nextValue = Number(e.target.value);
                      setPresetStartingPrices((prev) => {
                        const next = [...prev];
                        next[index] = Number.isFinite(nextValue) ? nextValue : 0;
                        return next;
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          ) : null}

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
            {pricingMode === "preset" ? (
              <>
                Preset room starting prices:{" "}
                <strong>{roomStartingPreview.map((value) => `$${value}`).join(", ")}</strong>
              </>
            ) : (
              <>
                Starting price per room:{" "}
                <strong>${roomStartingPreview[0] ?? 0}</strong>
              </>
            )}
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
