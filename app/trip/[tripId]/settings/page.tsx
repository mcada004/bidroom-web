"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { pullListingPreview } from "@/src/lib/listingPreviewClient";

type TripStatus = "draft" | "live" | "ended";

type Trip = {
  name: string;
  status: TripStatus;
  inviteCode: string;
  createdByUid: string;

  listingUrl?: string | null;
  listingTitle?: string | null;
  listingImageUrl?: string | null;
  listingDescription?: string | null;
  listingSiteName?: string | null;

  totalPrice: number;
  roomCount: number;
  auctionDurationHours: number;
  bidIncrement: number;
  antiSnipeWindowMinutes: number;
  antiSnipeExtendMinutes: number;
};

type SaveState =
  | { kind: "idle"; message: null }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

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

function parseWholeNumber(raw: string, label: string, min: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${label} must be a whole number greater than or equal to ${min}.`);
  }
  return parsed;
}

function extractHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export default function TripSettingsPage() {
  const params = useParams<{ tripId: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const tripId = params.tripId;
  const code = searchParams.get("code") ?? "";

  const { user, loading } = useAuth();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [listingTitle, setListingTitle] = useState("");
  const [listingImageUrl, setListingImageUrl] = useState("");
  const [listingDescription, setListingDescription] = useState("");
  const [listingSiteName, setListingSiteName] = useState("");

  const [totalPriceInput, setTotalPriceInput] = useState("");
  const [roomCountInput, setRoomCountInput] = useState("");
  const [durationHoursInput, setDurationHoursInput] = useState("");
  const [bidIncrementInput, setBidIncrementInput] = useState("");
  const [antiWindowInput, setAntiWindowInput] = useState("");
  const [antiExtendInput, setAntiExtendInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<"end" | "restart" | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle", message: null });

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const isManager = useMemo(() => {
    return !!(user && trip && user.uid === trip.createdByUid);
  }, [user, trip]);

  const isDraft = trip?.status === "draft";
  const draftOnlyFieldTitle = isDraft ? undefined : "Editable only while trip status is draft.";

  useEffect(() => {
    if (loading || user) return;

    const query = searchParams.toString();
    const next = query ? `${pathname}?${query}` : pathname;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [loading, user, pathname, router, searchParams]);

  useEffect(() => {
    if (!user) return;

    let unsubTrip: (() => void) | null = null;

    async function boot() {
      setError(null);

      const tripRef = doc(db, "trips", tripId);
      const snap = await getDoc(tripRef);
      if (!snap.exists()) {
        setError("Trip not found");
        return;
      }

      const data = snap.data() as Partial<Trip>;
      if (code && data.inviteCode && code !== data.inviteCode) {
        setError("Invalid invite link");
        return;
      }

      unsubTrip = onSnapshot(
        tripRef,
        (snapshot) => {
          const t = snapshot.data() as Partial<Trip>;
          const nextTrip: Trip = {
            name: typeof t.name === "string" ? t.name : "Trip",
            status: t.status === "live" || t.status === "ended" ? t.status : "draft",
            inviteCode: typeof t.inviteCode === "string" ? t.inviteCode : "",
            createdByUid: typeof t.createdByUid === "string" ? t.createdByUid : "",
            listingUrl: typeof t.listingUrl === "string" ? t.listingUrl : null,
            listingTitle: typeof t.listingTitle === "string" ? t.listingTitle : null,
            listingImageUrl: typeof t.listingImageUrl === "string" ? t.listingImageUrl : null,
            listingDescription: typeof t.listingDescription === "string" ? t.listingDescription : null,
            listingSiteName: typeof t.listingSiteName === "string" ? t.listingSiteName : null,
            totalPrice: Number(t.totalPrice ?? 0),
            roomCount: Number(t.roomCount ?? 0),
            auctionDurationHours: Number(t.auctionDurationHours ?? 24),
            bidIncrement: Number(t.bidIncrement ?? 20),
            antiSnipeWindowMinutes: Number(t.antiSnipeWindowMinutes ?? 10),
            antiSnipeExtendMinutes: Number(t.antiSnipeExtendMinutes ?? 10),
          };

          setTrip(nextTrip);

          setName(nextTrip.name);
          setListingUrl(nextTrip.listingUrl ?? "");
          setListingTitle(nextTrip.listingTitle ?? "");
          setListingImageUrl(nextTrip.listingImageUrl ?? "");
          setListingDescription(nextTrip.listingDescription ?? "");
          setListingSiteName(nextTrip.listingSiteName ?? "");

          setTotalPriceInput(String(nextTrip.totalPrice));
          setRoomCountInput(String(nextTrip.roomCount));
          setDurationHoursInput(String(nextTrip.auctionDurationHours));
          setBidIncrementInput(String(nextTrip.bidIncrement));
          setAntiWindowInput(String(nextTrip.antiSnipeWindowMinutes));
          setAntiExtendInput(String(nextTrip.antiSnipeExtendMinutes));
        },
        (snapshotError) => setError(snapshotError.message)
      );
    }

    boot().catch((bootError: unknown) => {
      const asObj = (bootError ?? {}) as { message?: unknown };
      setError(typeof asObj.message === "string" ? asObj.message : "Failed to load settings");
    });

    return () => {
      if (unsubTrip) unsubTrip();
    };
  }, [tripId, code, user]);

  async function saveTripSettings() {
    if (!trip || !isManager) return;

    setSaving(true);
    setSaveState({ kind: "idle", message: null });

    try {
      const nextName = name.trim() || "Trip";
      const listingUrlValue = parseListingUrlOrNull(listingUrl);
      const listingChanged = listingUrlValue !== (trip.listingUrl ?? null);

      const nextBidIncrement = parseWholeNumber(bidIncrementInput, "Bid increment", 1);
      const nextAntiWindow = parseWholeNumber(antiWindowInput, "Anti-sniping window", 0);
      const nextAntiExtend = parseWholeNumber(antiExtendInput, "Anti-sniping extension", 0);

      const payload: Record<string, unknown> = {
        name: nextName,
        listingUrl: listingUrlValue,
        bidIncrement: nextBidIncrement,
        antiSnipeWindowMinutes: nextAntiWindow,
        antiSnipeExtendMinutes: nextAntiExtend,
        updatedAt: serverTimestamp(),
      };

      if (listingChanged) {
        payload.listingTitle = null;
        payload.listingImageUrl = null;
        payload.listingDescription = null;
        payload.listingSiteName = null;
      }

      if (trip.status === "draft") {
        payload.totalPrice = parseWholeNumber(totalPriceInput, "Total trip price", 1);
        payload.roomCount = parseWholeNumber(roomCountInput, "Room count", 1);
        payload.auctionDurationHours = parseWholeNumber(durationHoursInput, "Auction duration", 1);
      }

      await updateDoc(doc(db, "trips", tripId), payload);

      if (listingChanged) {
        setListingTitle("");
        setListingImageUrl("");
        setListingDescription("");
        setListingSiteName("");
      }

      setSaveState({ kind: "success", message: "Trip settings saved." });
    } catch (saveError: unknown) {
      const asObj = (saveError ?? {}) as { message?: unknown };
      setSaveState({
        kind: "error",
        message: typeof asObj.message === "string" ? asObj.message : "Could not save trip settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function previewListing() {
    if (!trip || !user || !isManager) return;

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const listingUrlValue = parseListingUrlOrNull(listingUrl);
      if (!listingUrlValue) {
        throw new Error("Add a listing URL before refreshing preview.");
      }

      const idToken = await user.getIdToken();
      const pulled = await pullListingPreview({
        idToken,
        listingUrl: listingUrlValue,
        tripId,
      });

      const nextTitle = pulled.listingTitle ?? "";
      const nextImageUrl = pulled.listingImageUrl ?? "";
      const nextDescription = "";
      const resolvedSite = extractHostname(listingUrlValue) ?? "";

      setListingTitle(nextTitle);
      setListingImageUrl(nextImageUrl);
      setListingDescription(nextDescription);
      setListingSiteName(resolvedSite);

      if (
        !nextTitle &&
        !nextImageUrl &&
        pulled.listingBedrooms === null &&
        pulled.listingBeds === null &&
        pulled.listingBaths === null
      ) {
        setPreviewError("Preview is limited for this site, but the URL was saved.");
      }
    } catch (previewErr: unknown) {
      const asObj = (previewErr ?? {}) as { message?: unknown };
      setPreviewError(
        typeof asObj.message === "string"
          ? asObj.message
          : "Could not refresh preview for this listing URL."
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function startAuctionCore(currentTrip: Trip) {
    const durationMs = (Number(currentTrip.auctionDurationHours) || 24) * 60 * 60 * 1000;
    const endMs = Date.now() + durationMs;

    await updateDoc(doc(db, "trips", tripId), {
      status: "live",
      auctionStartAt: serverTimestamp(),
      auctionEndAt: new Date(endMs),
      updatedAt: serverTimestamp(),
    });
  }

  async function resetAuctionCore() {
    const roomsSnap = await getDocs(collection(db, "trips", tripId, "rooms"));

    let batch = writeBatch(db);
    let operations = 0;

    async function commitIfNeeded(force = false) {
      if (force || operations >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        operations = 0;
      }
    }

    batch.update(doc(db, "trips", tripId), {
      status: "draft",
      auctionStartAt: null,
      auctionEndAt: null,
      updatedAt: serverTimestamp(),
    });
    operations += 1;

    for (const roomDoc of roomsSnap.docs) {
      const roomId = roomDoc.id;

      const bidsSnap = await getDocs(collection(db, "trips", tripId, "rooms", roomId, "bids"));
      for (const bidDoc of bidsSnap.docs) {
        batch.delete(doc(db, "trips", tripId, "rooms", roomId, "bids", bidDoc.id));
        operations += 1;
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
      operations += 1;
      await commitIfNeeded();
    }

    await commitIfNeeded(true);
  }

  async function finalizeAuctionCore() {
    const roomsSnap = await getDocs(collection(db, "trips", tripId, "rooms"));
    const rooms = roomsSnap.docs.map((roomDoc) => {
      const roomData = roomDoc.data() as { currentHighBidAmount?: unknown };
      return {
        id: roomDoc.id,
        currentHighBidAmount: Number(roomData.currentHighBidAmount ?? 0),
      };
    });

    const winnersAssigned = new Set<string>();
    const roomsSorted = [...rooms].sort((a, b) => b.currentHighBidAmount - a.currentHighBidAmount);
    const batch = writeBatch(db);

    for (const room of roomsSorted) {
      const bidsSnap = await getDocs(collection(db, "trips", tripId, "rooms", room.id, "bids"));
      const bids = bidsSnap.docs
        .map((bidDoc) => bidDoc.data() as { amount?: unknown; bidTimeMs?: unknown; bidderUid?: unknown })
        .filter((bid) => {
          return (
            typeof bid.amount === "number" &&
            typeof bid.bidTimeMs === "number" &&
            typeof bid.bidderUid === "string"
          );
        })
        .sort((a, b) => {
          if ((b.amount as number) !== (a.amount as number)) {
            return (b.amount as number) - (a.amount as number);
          }
          return (a.bidTimeMs as number) - (b.bidTimeMs as number);
        });

      const winnerBid = bids.find((bid) => !winnersAssigned.has(bid.bidderUid as string));
      const roomRef = doc(db, "trips", tripId, "rooms", room.id);

      if (winnerBid) {
        winnersAssigned.add(winnerBid.bidderUid as string);
        batch.update(roomRef, {
          winnerUid: winnerBid.bidderUid,
          winnerAmount: winnerBid.amount,
        });
      } else {
        batch.update(roomRef, {
          winnerUid: null,
          winnerAmount: null,
        });
      }
    }

    batch.update(doc(db, "trips", tripId), {
      status: "ended",
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  }

  async function endAuctionNow() {
    if (!trip || !isManager) return;
    if (trip.status !== "live") {
      setSaveState({ kind: "error", message: "Auction is not live." });
      return;
    }

    const ok = window.confirm("End the auction now and finalize winners?");
    if (!ok) return;

    setActionBusy("end");
    setSaveState({ kind: "idle", message: null });

    try {
      await updateDoc(doc(db, "trips", tripId), {
        auctionEndAt: new Date(),
        updatedAt: serverTimestamp(),
      });
      await finalizeAuctionCore();
      setSaveState({ kind: "success", message: "Auction ended and winners finalized." });
    } catch (actionError: unknown) {
      const asObj = (actionError ?? {}) as { message?: unknown };
      setSaveState({
        kind: "error",
        message: typeof asObj.message === "string" ? asObj.message : "Could not end auction.",
      });
    } finally {
      setActionBusy(null);
    }
  }

  async function restartAuction() {
    if (!trip || !isManager) return;
    if (trip.status === "draft") {
      setSaveState({ kind: "error", message: "Auction is in draft. Start it from the trip page." });
      return;
    }

    const ok = window.confirm("Restart auction? This clears all bids and starts a fresh auction immediately.");
    if (!ok) return;

    setActionBusy("restart");
    setSaveState({ kind: "idle", message: null });

    try {
      await resetAuctionCore();
      await startAuctionCore(trip);
      setSaveState({ kind: "success", message: "Auction restarted." });
    } catch (actionError: unknown) {
      const asObj = (actionError ?? {}) as { message?: unknown };
      setSaveState({
        kind: "error",
        message: typeof asObj.message === "string" ? asObj.message : "Could not restart auction.",
      });
    } finally {
      setActionBusy(null);
    }
  }

  if (loading) return <main className="page">Loading…</main>;
  if (!user) return <main className="page">Redirecting to sign in…</main>;
  if (error) return <main className="page">{error}</main>;
  if (!trip) return <main className="page">Loading trip…</main>;

  if (!isManager) {
    return (
      <main className="page">
        <section className="hero">
          <h1 className="hero-title">Trip settings</h1>
          <p className="hero-subtitle">Not authorized.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">Trip settings</h1>
        <p className="hero-subtitle">
          Trip: {trip.name} • Status: {trip.status}
        </p>
      </section>

      <section className="card">
        <div className="section-title">Auction controls</div>
        <p className="muted" style={{ marginBottom: 12 }}>
          These controls are manager-only.
        </p>
        <div className="row">
          <button
            type="button"
            className="button secondary"
            onClick={endAuctionNow}
            disabled={actionBusy !== null || trip.status !== "live"}
            title={trip.status === "live" ? undefined : "Available while the auction is live."}
          >
            {actionBusy === "end" ? "Working…" : "End auction now"}
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={restartAuction}
            disabled={actionBusy !== null || trip.status === "draft"}
            title={trip.status === "draft" ? "Available after an auction has started." : undefined}
          >
            {actionBusy === "restart" ? "Working…" : "Restart auction"}
          </button>
        </div>
      </section>

      <section className="card section">
        <div className="section-title">Editable fields</div>
        <p className="notice" style={{ marginBottom: 16 }}>
          Changes here update display and future bids only. Existing bids are not rewritten.
        </p>

        <div className="stack">
          <label className="label">
            Trip name
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving || actionBusy !== null}
            />
          </label>

          <label className="label">
            Listing URL
            <input
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={listingUrl}
              onChange={(event) => setListingUrl(event.target.value)}
              disabled={saving || actionBusy !== null}
            />
          </label>

          {listingUrl.trim() ? (
            <div className="row">
              <button
                type="button"
                className="button secondary"
                onClick={previewListing}
                disabled={previewLoading || saving || actionBusy !== null}
              >
                {previewLoading ? "Refreshing…" : "Refresh preview"}
              </button>
              <span className="muted" style={{ fontSize: 13 }}>
                Uses /api/listing-preview
              </span>
            </div>
          ) : null}

          {previewError ? <div className="notice">{previewError}</div> : null}

          {(listingTitle || listingImageUrl || listingDescription || listingSiteName || listingUrl) && (
            <div className="list-item" style={{ display: "grid", gap: 10 }}>
              {listingImageUrl ? (
                <img
                  src={listingImageUrl}
                  alt={listingTitle || "Listing preview"}
                  style={{
                    width: "100%",
                    maxWidth: 420,
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    objectFit: "cover",
                    maxHeight: 260,
                  }}
                />
              ) : null}
              <div style={{ display: "grid", gap: 6 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Listing preview
                </div>
                <div>{listingTitle || "Title unavailable"}</div>
                {(listingSiteName || listingUrl) && (
                  <div className="muted" style={{ fontSize: 13 }}>
                    {listingSiteName || extractHostname(listingUrl) || ""}
                  </div>
                )}
                {listingDescription ? (
                  <div className="muted" style={{ fontSize: 13 }}>
                    {listingDescription.length > 220
                      ? `${listingDescription.slice(0, 217)}...`
                      : listingDescription}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <label className="label">
            Auction duration (hours)
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={durationHoursInput}
              onChange={(event) => setDurationHoursInput(event.target.value)}
              disabled={!isDraft || saving || actionBusy !== null}
              title={draftOnlyFieldTitle}
            />
          </label>

          <label className="label">
            Bid increment ($)
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={bidIncrementInput}
              onChange={(event) => setBidIncrementInput(event.target.value)}
              disabled={saving || actionBusy !== null}
            />
          </label>

          <label className="label">
            Anti-sniping window (minutes)
            <input
              className="input"
              type="number"
              min={0}
              step={1}
              value={antiWindowInput}
              onChange={(event) => setAntiWindowInput(event.target.value)}
              disabled={saving || actionBusy !== null}
            />
          </label>

          <label className="label">
            Anti-sniping extension (minutes)
            <input
              className="input"
              type="number"
              min={0}
              step={1}
              value={antiExtendInput}
              onChange={(event) => setAntiExtendInput(event.target.value)}
              disabled={saving || actionBusy !== null}
            />
          </label>

          <label className="label">
            Room count
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={roomCountInput}
              onChange={(event) => setRoomCountInput(event.target.value)}
              disabled={!isDraft || saving || actionBusy !== null}
              title={draftOnlyFieldTitle}
            />
          </label>

          <label className="label">
            Total trip price ($)
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={totalPriceInput}
              onChange={(event) => setTotalPriceInput(event.target.value)}
              disabled={!isDraft || saving || actionBusy !== null}
              title={draftOnlyFieldTitle}
            />
          </label>

          <button
            type="button"
            className="button"
            onClick={saveTripSettings}
            disabled={saving || actionBusy !== null}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>

          {saveState.message ? (
            <p className="notice" aria-live="polite">
              {saveState.message}
            </p>
          ) : null}
        </div>
      </section>

      <div className="section row" style={{ justifyContent: "space-between" }}>
        <span className="muted">Back to the auction room.</span>
        <a className="button secondary" href={`/trip/${tripId}?code=${encodeURIComponent(trip.inviteCode)}`}>
          Trip page
        </a>
      </div>
    </main>
  );
}
