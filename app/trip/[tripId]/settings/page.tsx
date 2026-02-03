"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";

type Trip = {
  name: string;
  status: "draft" | "live" | "ended";
  inviteCode: string;
  createdByUid: string;

  totalPrice: number;
  auctionDurationHours: number;
  bidIncrement: number;

  antiSnipeWindowMinutes: number;
  antiSnipeExtendMinutes: number;
};

type Room = {
  id: string;
  name: string;
  capacity: number;
};

export default function TripSettingsPage() {
  const params = useParams<{ tripId: string }>();
  const searchParams = useSearchParams();
  const tripId = params.tripId;
  const code = searchParams.get("code") ?? "";

  const { user, loading } = useAuth();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [name, setName] = useState("");
  const [totalPrice, setTotalPrice] = useState<number>(0);
  const [durationHours, setDurationHours] = useState<number>(24);
  const [bidIncrement, setBidIncrement] = useState<number>(20);
  const [antiWin, setAntiWin] = useState<number>(10);
  const [antiExt, setAntiExt] = useState<number>(10);

  const [saving, setSaving] = useState(false);

  const isManager = useMemo(() => {
    return !!(user && trip && user.uid === trip.createdByUid);
  }, [user, trip]);

  useEffect(() => {
    let unsubTrip: (() => void) | null = null;
    let unsubRooms: (() => void) | null = null;

    async function boot() {
      setError(null);

      const tripRef = doc(db, "trips", tripId);
      const snap = await getDoc(tripRef);
      if (!snap.exists()) {
        setError("Trip not found");
        return;
      }

      const data = snap.data() as any;
      if (code && data.inviteCode && code !== data.inviteCode) {
        setError("Invalid invite link");
        return;
      }

      unsubTrip = onSnapshot(tripRef, (s) => {
        const t = s.data() as any;
        setTrip(t);

        // hydrate form when trip loads/changes
        setName(t.name ?? "");
        setTotalPrice(Number(t.totalPrice ?? 0));
        setDurationHours(Number(t.auctionDurationHours ?? 24));
        setBidIncrement(Number(t.bidIncrement ?? 20));
        setAntiWin(Number(t.antiSnipeWindowMinutes ?? 10));
        setAntiExt(Number(t.antiSnipeExtendMinutes ?? 10));
      });

      unsubRooms = onSnapshot(collection(db, "trips", tripId, "rooms"), (snap2) => {
        setRooms(
          snap2.docs.map((d) => {
            const r = d.data() as any;
            return {
              id: d.id,
              name: r.name ?? "Room",
              capacity: Number(r.capacity ?? 0),
            } as Room;
          })
        );
      });
    }

    if (!loading) boot().catch((e: any) => setError(e?.message ?? "Failed to load"));

    return () => {
      if (unsubTrip) unsubTrip();
      if (unsubRooms) unsubRooms();
    };
  }, [tripId, code, loading]);

  async function saveTripSettings() {
    if (!trip) return;

    if (!isManager) return alert("Only the trip manager can edit settings.");
    if (trip.status !== "draft") return alert("Settings are only editable in DRAFT for now.");

    setSaving(true);
    try {
      await updateDoc(doc(db, "trips", tripId), {
        name: name.trim() || "Trip",
        totalPrice: Number(totalPrice),
        auctionDurationHours: Number(durationHours),
        bidIncrement: Number(bidIncrement),
        antiSnipeWindowMinutes: Number(antiWin),
        antiSnipeExtendMinutes: Number(antiExt),
      });

      alert("Saved.");
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveRoom(roomId: string, newName: string, newCap: number) {
    if (!trip) return;
    if (!isManager) return alert("Only the trip manager can edit rooms.");
    if (trip.status !== "draft") return alert("Rooms are only editable in DRAFT for now.");

    setSaving(true);
    try {
      await updateDoc(doc(db, "trips", tripId, "rooms", roomId), {
        name: newName.trim() || "Room",
        capacity: Number(newCap),
      });
    } catch (e: any) {
      alert(e?.message ?? "Room save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Please sign in.</main>;
  if (error) return <main className="page">{error}</main>;
  if (!trip) return <main className="page">Loading trip…</main>;

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">Trip settings</h1>
        <p className="hero-subtitle">
          Trip: {trip.name} • Status: {trip.status}
        </p>
        {!isManager && <div className="notice">You’re not the manager. Settings are read-only.</div>}
      </section>

      <section className="card">
        <div className="section-title">Trip</div>
        <div className="stack">
          <label className="label">
            Name
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isManager || trip.status !== "draft"}
            />
          </label>

          <label className="label">
            Total trip price ($)
            <input
              className="input"
              type="number"
              value={totalPrice}
              onChange={(e) => setTotalPrice(Number(e.target.value))}
              disabled={!isManager || trip.status !== "draft"}
            />
          </label>

          <label className="label">
            Auction duration (hours)
            <input
              className="input"
              type="number"
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
              disabled={!isManager || trip.status !== "draft"}
            />
          </label>

          <div className="section-title">Rules</div>

          <label className="label">
            Minimum bid increment ($)
            <input
              className="input"
              type="number"
              value={bidIncrement}
              onChange={(e) => setBidIncrement(Number(e.target.value))}
              disabled={!isManager || trip.status !== "draft"}
            />
          </label>

          <label className="label">
            Anti-sniping window (minutes)
            <input
              className="input"
              type="number"
              value={antiWin}
              onChange={(e) => setAntiWin(Number(e.target.value))}
              disabled={!isManager || trip.status !== "draft"}
            />
          </label>

          <label className="label">
            Extend by (minutes)
            <input
              className="input"
              type="number"
              value={antiExt}
              onChange={(e) => setAntiExt(Number(e.target.value))}
              disabled={!isManager || trip.status !== "draft"}
            />
          </label>

          <button
            onClick={saveTripSettings}
            disabled={!isManager || trip.status !== "draft" || saving}
            className="button"
          >
            {saving ? "Saving…" : "Save trip settings"}
          </button>
        </div>
      </section>

      <section className="card section">
        <div className="section-title">Rooms</div>
        <p className="muted">Editable in DRAFT only (for now).</p>

        {rooms.length === 0 ? (
          <p className="muted">No rooms found.</p>
        ) : (
          <ul className="list">
            {rooms.map((r) => (
              <RoomEditor
                key={r.id}
                room={r}
                disabled={!isManager || trip.status !== "draft" || saving}
                onSave={saveRoom}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="section row" style={{ justifyContent: "space-between" }}>
        <span className="muted">Back to the trip overview.</span>
        <a className="button secondary" href={`/trip/${tripId}?code=${trip.inviteCode}`}>
          Trip page
        </a>
      </div>
    </main>
  );
}

function RoomEditor({
  room,
  disabled,
  onSave,
}: {
  room: Room;
  disabled: boolean;
  onSave: (roomId: string, newName: string, newCap: number) => Promise<void>;
}) {
  const [name, setName] = useState(room.name);
  const [cap, setCap] = useState<number>(room.capacity);

  useEffect(() => {
    setName(room.name);
    setCap(room.capacity);
  }, [room.id, room.name, room.capacity]);

  return (
    <li className="list-item">
      <div className="stack" style={{ maxWidth: 600 }}>
        <label className="label">
          Room name
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
          />
        </label>

        <label className="label">
          Capacity (sleeps)
          <input
            className="input"
            type="number"
            value={cap}
            onChange={(e) => setCap(Number(e.target.value))}
            disabled={disabled}
          />
        </label>

        <button onClick={() => onSave(room.id, name, cap)} disabled={disabled} className="button secondary">
          Save room
        </button>
      </div>
    </li>
  );
}
