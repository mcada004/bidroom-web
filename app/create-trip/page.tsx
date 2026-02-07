"use client";

import { useState } from "react";
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
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { getPreferredDisplayName } from "@/src/lib/authGuests";

function makeInviteCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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
    const value = raw.trim();
    if (!value) return null;

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("Listing link must be a valid URL starting with http:// or https://");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Listing link must start with http:// or https://");
    }

    return value;
  }

  async function createTrip() {
    if (!user) return;

    setBusy(true);
    setError(null);

    try {
      const P = Number(totalPrice);
      const N = Number(roomCount);
      const listingUrlValue = parseListingUrlOrNull(listingUrl);

      if (!P || P <= 0) throw new Error("Total trip price must be > 0");
      if (!N || N < 1) throw new Error("Room count must be at least 1");

      const inviteCode = makeInviteCode(6);
      const startingPricePerRoom = Math.ceil(P / N);

      // Create trip doc
      const tripRef = await addDoc(collection(db, "trips"), {
        name: tripName.trim() || "New Trip",
        createdByUid: user.uid,
        status: "draft",
        inviteCode,
        listingUrl: listingUrlValue,

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
      });

      // Add creator as manager
      await setDoc(doc(db, "trips", tripRef.id, "members", user.uid), {
        displayName: getPreferredDisplayName(user),
        role: "manager",
        joinedAt: serverTimestamp(),
      });

      // Create rooms automatically
      const batch = writeBatch(db);

      for (let i = 1; i <= N; i++) {
        const roomDoc = doc(collection(db, "trips", tripRef.id, "rooms"));
        batch.set(roomDoc, {
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

      await batch.commit();

      router.push(`/trip/${tripRef.id}?code=${inviteCode}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create trip");
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
