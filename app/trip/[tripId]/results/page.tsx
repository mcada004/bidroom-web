"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";

type Room = {
  id: string;
  name: string;

  // live tracking
  currentHighBidAmount: number;
  currentHighBidderUid: string | null;

  // finalized results
  winnerUid: string | null;
  winnerAmount: number | null;
};

type Member = {
  uid: string;
  displayName: string;
};

type Trip = {
  name: string;
  status: "draft" | "live" | "ended";
  totalPrice: number;
  inviteCode: string;
  pricingMode?: "equalSplit" | "zero" | "preset" | "firstBid";
  listingUrl?: string | null;
};

export default function ResultsPage() {
  const params = useParams<{ tripId: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const tripId = params.tripId;
  const code = searchParams.get("code") ?? "";

  const { user, loading } = useAuth();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || user) return;

    const query = searchParams.toString();
    const next = query ? `${pathname}?${query}` : pathname;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [loading, user, pathname, router, searchParams]);

  // Validate invite code once, then subscribe
  useEffect(() => {
    if (!user) return;

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

      if (code && data.inviteCode && code !== data.inviteCode) {
        setError("Invalid invite link");
        return;
      }

      unsubTrip = onSnapshot(tripRef, (s) => setTrip(s.data() as any));

      unsubRooms = onSnapshot(collection(db, "trips", tripId, "rooms"), (snap2) => {
        setRooms(
          snap2.docs.map((d) => {
            const r = d.data() as any;
            return {
              id: d.id,
              name: r.name ?? "Room",

              currentHighBidAmount: Number(r.currentHighBidAmount ?? 0),
              currentHighBidderUid: r.currentHighBidderUid ?? null,

              winnerUid: r.winnerUid ?? null,
              winnerAmount: typeof r.winnerAmount === "number" ? r.winnerAmount : null,
            } as Room;
          })
        );
      });

      unsubMembers = onSnapshot(
        collection(db, "trips", tripId, "members"),
        (snap3) => {
          setMembers(
            snap3.docs.map((d) => {
              const m = d.data() as any;
              return { uid: d.id, displayName: m.displayName ?? d.id } as Member;
            })
          );
        },
        () => setMembers([])
      );
    }

    if (!loading) boot().catch((e: any) => setError(e?.message ?? "Failed to load"));

    return () => {
      if (unsubTrip) unsubTrip();
      if (unsubRooms) unsubRooms();
      if (unsubMembers) unsubMembers();
    };
  }, [tripId, code, loading, user]);

  const memberName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.uid] = m.displayName;
    return map;
  }, [members]);

  function participantLabel(uid: string | null) {
    if (!uid) return null;
    return memberName[uid] ?? "Participant";
  }

  // Live leaders per room (during live auction)
  const liveLeaders = useMemo(() => {
    return rooms.map((r) => ({
      roomId: r.id,
      roomName: r.name,
      uid: r.currentHighBidderUid,
      amount: r.currentHighBidAmount || 0,
    }));
  }, [rooms]);

  // Final winners per room (after finalize)
  const finalWinners = useMemo(() => {
    return rooms.map((r) => ({
      roomId: r.id,
      roomName: r.name,
      uid: r.winnerUid,
      amount: r.winnerAmount ?? 0,
    }));
  }, [rooms]);

  // For pricing logic (works both live and ended)
  // If ended -> use final winners
  // If live -> use current high bids as "winners so far"
  const activeWinnerAmounts = useMemo(() => {
    if (!trip) return [];
    if (trip.status === "ended") {
      return rooms
        .filter((r) => r.winnerUid)
        .map((r) => ({ roomId: r.id, uid: r.winnerUid as string, amount: r.winnerAmount ?? 0 }));
    }
    // draft/live: treat current highs as provisional winners (only if bid > 0)
    return rooms
      .filter((r) => (r.currentHighBidAmount || 0) > 0 && r.currentHighBidderUid)
      .map((r) => ({ roomId: r.id, uid: r.currentHighBidderUid as string, amount: r.currentHighBidAmount || 0 }));
  }, [trip, rooms]);

  const totalBidSoFar = useMemo(
    () => activeWinnerAmounts.reduce((s, x) => s + (x.amount || 0), 0),
    [activeWinnerAmounts]
  );

  const unbidRoomsCount = useMemo(() => {
    if (!trip) return 0;
    if (trip.status === "ended") {
      return rooms.filter((r) => !r.winnerUid).length;
    }
    return rooms.filter((r) => (r.currentHighBidAmount || 0) === 0).length;
  }, [trip, rooms]);

  const remainingBalance = useMemo(() => {
    if (!trip) return 0;
    return Math.max(0, trip.totalPrice - totalBidSoFar);
  }, [trip, totalBidSoFar]);

  const unbidRoomPrice = useMemo(() => {
    if (!trip) return 0;
    if (unbidRoomsCount === 0) return 0;
    return Math.floor(remainingBalance / unbidRoomsCount);
  }, [trip, remainingBalance, unbidRoomsCount]);

  const leftoverAfterSplit = useMemo(() => {
    if (!trip) return 0;
    if (unbidRoomsCount === 0) return 0;
    return remainingBalance - unbidRoomPrice * unbidRoomsCount;
  }, [trip, remainingBalance, unbidRoomPrice, unbidRoomsCount]);

  const myProvisional = useMemo(() => {
    if (!user || !trip) return null;

    if (trip.status === "ended") {
      const w = rooms.find((r) => r.winnerUid === user.uid);
      if (!w) return null;
      return { roomName: w.name, amount: w.winnerAmount ?? 0, type: "final" as const };
    }

    const live = rooms.find((r) => r.currentHighBidderUid === user.uid);
    if (!live) return null;
    return { roomName: live.name, amount: live.currentHighBidAmount || 0, type: "live" as const };
  }, [user, trip, rooms]);

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Redirecting to sign in…</main>;
  if (error) return <main className="page">{error}</main>;
  if (!trip) return <main className="page">Loading trip…</main>;

  const title =
    trip.status === "ended" ? "Results (Final)" : trip.status === "live" ? "Results (Live)" : "Results";

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">
          {trip.name} — {title}
        </h1>
        <p className="hero-subtitle">Track final results or watch the live leaders.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="pill">Status: {trip.status}</span>
          <span className="pill">Trip total: ${trip.totalPrice}</span>
        </div>
        {trip.listingUrl ? (
          <p style={{ marginTop: 12 }}>
            <a href={trip.listingUrl} target="_blank" rel="noopener noreferrer">
              View listing
            </a>
          </p>
        ) : null}
      </section>

      <section className="card">
        <div className="section-title">My status</div>
        {trip.status === "draft" && <p className="muted">The auction hasn’t started yet.</p>}

        {trip.status === "live" && (
          <>
            {myProvisional ? (
              <p>
                You’re currently winning <strong>{myProvisional.roomName}</strong> at{" "}
                <strong>${myProvisional.amount}</strong>.
              </p>
            ) : (
              <p>
                You’re not currently winning a room. If nothing changes, your estimated unbid-room price is about{" "}
                <strong>${unbidRoomPrice}</strong>.
              </p>
            )}
          </>
        )}

        {trip.status === "ended" && (
          <>
            {myProvisional ? (
              <p>
                Final: you won <strong>{myProvisional.roomName}</strong> for{" "}
                <strong>${myProvisional.amount}</strong>.
              </p>
            ) : (
              <p>
                Final: you didn’t win a bid-room. Your price is based on the unbid-room split:{" "}
                <strong>${unbidRoomPrice}</strong>
                {leftoverAfterSplit > 0 ? " (some people may have +$1 due to rounding)" : ""}.
              </p>
            )}
          </>
        )}
      </section>

      {trip.status !== "ended" && (
        <>
          <section className="card section">
            <div className="section-title">Live leaders by room</div>
            <ul className="list">
              {liveLeaders.map((r) => (
                <li key={r.roomId} className="list-item">
                  <strong>{r.roomName}</strong>
                  <div className="muted">
                    {r.amount > 0 ? (
                      <>
                        {participantLabel(r.uid)} — <strong>${r.amount}</strong>
                      </>
                    ) : (
                      <>No bids yet</>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card section">
            <div className="section-title">Live estimated pricing</div>
            <div className="grid-2">
              <div className="notice">Total bids so far: <strong>${totalBidSoFar}</strong></div>
              <div className="notice">Unbid rooms: <strong>{unbidRoomsCount}</strong></div>
              <div className="notice">Estimated unbid-room price: <strong>${unbidRoomPrice}</strong></div>
            </div>
          </section>
        </>
      )}

      {trip.status === "ended" && (
        <>
          <section className="card section">
            <div className="section-title">Final winners</div>
            <ul className="list">
              {finalWinners.map((r) => (
                <li key={r.roomId} className="list-item">
                  <strong>{r.roomName}</strong>
                  <div className="muted">
                    {r.uid ? (
                      <>
                        {participantLabel(r.uid)} — <strong>${r.amount}</strong>
                      </>
                    ) : (
                      <>No winner</>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card section">
            <div className="section-title">Final unbid room pricing</div>
            <div className="grid-2">
              <div className="notice">Remaining balance: <strong>${remainingBalance}</strong></div>
              <div className="notice">Unbid rooms: <strong>{unbidRoomsCount}</strong></div>
              <div className="notice">Price per unbid room: <strong>${unbidRoomPrice}</strong></div>
            </div>
            {leftoverAfterSplit > 0 && (
              <p className="muted" style={{ marginTop: 12 }}>
                Rounding: <strong>${leftoverAfterSplit}</strong> leftover exists (some people may have +$1).
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
