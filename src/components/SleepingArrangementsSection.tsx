"use client";

import { ChangeEvent, useState } from "react";
import { auth } from "@/src/lib/firebase";
import {
  createDefaultSleepingRooms,
  normalizeBedroomCount,
  parseSleepingArrangementText,
} from "@/src/lib/sleepingArrangements";
import type { SleepingRoom } from "@/src/lib/sleepingArrangements";

type Props = {
  bedroomCount: number;
  rooms: SleepingRoom[];
  detailsEnabled: boolean;
  disabled?: boolean;
  helperText?: string;
  onBedroomCountChange: (count: number) => void;
  onRoomsChange: (rooms: SleepingRoom[]) => void;
  onDetailsEnabledChange: (enabled: boolean) => void;
};

type ImportResponse = {
  rooms?: SleepingRoom[];
  error?: string;
};

export default function SleepingArrangementsSection({
  bedroomCount,
  rooms,
  detailsEnabled,
  disabled = false,
  helperText,
  onBedroomCountChange,
  onRoomsChange,
  onDetailsEnabledChange,
}: Props) {
  const [showImportTools, setShowImportTools] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState("");

  function updateBedroomCount(nextValue: unknown) {
    const nextCount = normalizeBedroomCount(nextValue);
    onBedroomCountChange(nextCount);
    if (detailsEnabled) {
      onRoomsChange(createDefaultSleepingRooms(nextCount, rooms));
    }
  }

  function enableManualDetails() {
    onDetailsEnabledChange(true);
    onRoomsChange(createDefaultSleepingRooms(bedroomCount, rooms));
    setImportNotice(null);
    setImportError(null);
  }

  function clearDetails() {
    onDetailsEnabledChange(false);
    onRoomsChange([]);
    setImportNotice(null);
    setImportError(null);
  }

  function applyImportedRooms(nextRooms: SleepingRoom[], sourceLabel: string) {
    const nextCount = normalizeBedroomCount(nextRooms.length || bedroomCount);
    onBedroomCountChange(nextCount);
    onRoomsChange(createDefaultSleepingRooms(nextCount, nextRooms));
    onDetailsEnabledChange(true);
    setImportNotice(`Loaded ${nextCount} bedroom ${nextCount === 1 ? "card" : "cards"} from ${sourceLabel}. Review and edit before saving.`);
    setImportError(null);
  }

  function importFromText() {
    const trimmed = importText.trim();
    if (!trimmed) {
      setImportError("Paste bedroom text first.");
      setImportNotice(null);
      return;
    }

    applyImportedRooms(parseSleepingArrangementText(trimmed, bedroomCount), "pasted text");
  }

  async function importFromScreenshot(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setSelectedImageName(file.name);
    setImportBusy(true);
    setImportError(null);
    setImportNotice(null);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
            return;
          }
          reject(new Error("Could not read screenshot."));
        };
        reader.onerror = () => reject(new Error("Could not read screenshot."));
        reader.readAsDataURL(file);
      });

      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/sleeping-arrangements-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });

      const payload = (await response.json().catch(() => ({}))) as ImportResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Could not import from screenshot.");
      }

      if (!Array.isArray(payload.rooms) || payload.rooms.length === 0) {
        throw new Error("Could not detect bedroom details in that screenshot.");
      }

      applyImportedRooms(payload.rooms, "the screenshot");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not import from screenshot.";
      setImportError(message);
      setImportNotice("You can still paste bedroom text or start from the bedroom count.");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div className="list-item" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          Sleeping arrangements
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Bedroom count is the only required part of this section.
        </p>
        {helperText ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {helperText}
          </p>
        ) : null}
      </div>

      <label className="label">
        Number of bedrooms
        <input
          className="input"
          type="number"
          min={1}
          step={1}
          value={bedroomCount}
          onChange={(event) => updateBedroomCount(event.target.value)}
          disabled={disabled}
        />
      </label>

      <div className="row">
        <button
          type="button"
          className="button secondary"
          onClick={enableManualDetails}
          disabled={disabled}
        >
          {detailsEnabled ? "Edit bedroom details" : "Add bedroom details"}
        </button>
        <button
          type="button"
          className="button ghost"
          onClick={() => setShowImportTools((current) => !current)}
          disabled={disabled}
        >
          {showImportTools ? "Hide import help" : "Import sleeping arrangements"}
        </button>
        {detailsEnabled ? (
          <button
            type="button"
            className="button ghost"
            onClick={clearDetails}
            disabled={disabled}
          >
            Use bedroom count only
          </button>
        ) : null}
      </div>

      {showImportTools ? (
        <div className="card soft" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <strong style={{ fontSize: 14 }}>Import help</strong>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Imported bedroom cards are suggestions. Review and edit them before saving.
            </p>
          </div>

          <div className="row">
            <label className="button secondary" style={{ display: "inline-flex", alignItems: "center" }}>
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={importFromScreenshot}
                disabled={disabled || importBusy}
              />
              {importBusy ? "Importing screenshot…" : "Upload screenshot"}
            </label>
            {selectedImageName ? (
              <span className="muted" style={{ fontSize: 13 }}>
                {selectedImageName}
              </span>
            ) : null}
          </div>

          <label className="label">
            Paste bedroom text
            <textarea
              className="input"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              rows={5}
              style={{ resize: "vertical", minHeight: 120 }}
              placeholder={"Bedroom 1: 1 king bed, sleeps 2\nBedroom 2: 2 queens, sleeps 4"}
              disabled={disabled || importBusy}
            />
          </label>

          <div className="row">
            <button
              type="button"
              className="button secondary"
              onClick={importFromText}
              disabled={disabled || importBusy}
            >
              Use pasted text
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={enableManualDetails}
              disabled={disabled || importBusy}
            >
              Start from bedroom count
            </button>
          </div>

          {importError ? <div className="notice">{importError}</div> : null}
          {importNotice ? <div className="notice">{importNotice}</div> : null}
        </div>
      ) : null}

      {detailsEnabled ? (
        <div className="stack" style={{ gap: 12 }}>
          {rooms.map((room, index) => (
            <div key={`sleeping-room-${index + 1}`} className="card soft" style={{ padding: 16, display: "grid", gap: 12 }}>
              <strong style={{ fontSize: 14 }}>Bedroom {index + 1}</strong>

              <label className="label">
                Room name
                <input
                  className="input"
                  value={room.roomName}
                  onChange={(event) => {
                    const next = [...rooms];
                    next[index] = { ...room, roomName: event.target.value };
                    onRoomsChange(next);
                  }}
                  disabled={disabled}
                />
              </label>

              <div className="grid-2">
                <label className="label">
                  Bed type
                  <input
                    className="input"
                    value={room.bedType}
                    onChange={(event) => {
                      const next = [...rooms];
                      next[index] = { ...room, bedType: event.target.value };
                      onRoomsChange(next);
                    }}
                    disabled={disabled}
                    placeholder="King, Queen, Bunk, Sofa bed"
                  />
                </label>

                <label className="label">
                  Bed count
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={1}
                    value={room.bedCount}
                    onChange={(event) => {
                      const next = [...rooms];
                      next[index] = { ...room, bedCount: normalizeBedroomCount(event.target.value) };
                      onRoomsChange(next);
                    }}
                    disabled={disabled}
                  />
                </label>

                <label className="label">
                  Sleeps
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={1}
                    value={room.sleeps}
                    onChange={(event) => {
                      const next = [...rooms];
                      next[index] = { ...room, sleeps: normalizeBedroomCount(event.target.value) };
                      onRoomsChange(next);
                    }}
                    disabled={disabled}
                  />
                </label>
              </div>

              <label className="label">
                Notes
                <textarea
                  className="input"
                  value={room.notes}
                  onChange={(event) => {
                    const next = [...rooms];
                    next[index] = { ...room, notes: event.target.value };
                    onRoomsChange(next);
                  }}
                  rows={3}
                  style={{ resize: "vertical" }}
                  disabled={disabled}
                />
              </label>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
