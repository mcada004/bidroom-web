export type SleepingRoom = {
  roomName: string;
  bedType: string;
  bedCount: number;
  sleeps: number;
  notes: string;
};

export type SleepingArrangements = {
  bedroomCount: number;
  rooms: SleepingRoom[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeBedroomCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.round(parsed));
}

export function normalizeSleepingRoom(value: unknown, index: number): SleepingRoom {
  const room = isPlainObject(value) ? value : {};
  const roomName =
    typeof room.roomName === "string" && room.roomName.trim() ? room.roomName.trim() : `Bedroom ${index + 1}`;
  const bedType = typeof room.bedType === "string" ? room.bedType.trim() : "";
  const rawBedCount = Number(room.bedCount);
  const bedCount = Number.isFinite(rawBedCount) ? Math.max(1, Math.round(rawBedCount)) : 1;
  const rawSleeps = Number(room.sleeps);
  const sleeps = Number.isFinite(rawSleeps) ? Math.max(1, Math.round(rawSleeps)) : Math.max(2, bedCount);
  const notes = typeof room.notes === "string" ? room.notes.trim() : "";

  return {
    roomName,
    bedType,
    bedCount,
    sleeps,
    notes,
  };
}

export function createDefaultSleepingRooms(count: number, existing: unknown[] = []): SleepingRoom[] {
  const safeCount = normalizeBedroomCount(count);
  return Array.from({ length: safeCount }, (_, index) => normalizeSleepingRoom(existing[index], index));
}

function detectBedType(value: string): string {
  const patterns: Array<[RegExp, string]> = [
    [/\bking\b/i, "King"],
    [/\bqueen\b/i, "Queen"],
    [/\bfull\b/i, "Full"],
    [/\bdouble\b/i, "Double"],
    [/\btwin\b/i, "Twin"],
    [/\bsingle\b/i, "Single"],
    [/\bbunk\b/i, "Bunk"],
    [/\bsofa bed\b/i, "Sofa bed"],
    [/\bfuton\b/i, "Futon"],
    [/\bdaybed\b/i, "Daybed"],
    [/\bmurphy\b/i, "Murphy bed"],
    [/\btrundle\b/i, "Trundle"],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(value)) return label;
  }

  return "";
}

export function parseSleepingArrangementText(text: string, fallbackCount: number): SleepingRoom[] {
  const normalized = text.replace(/\r/g, "\n").replace(/[;|]+/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/^[\s•*\-]+/, "").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return createDefaultSleepingRooms(fallbackCount);
  }

  const parsed = lines
    .map((line, index) => {
      let roomName = "";
      let details = line;

      const headingMatch = line.match(/^(.+?)(?:\s*[:\-–—]\s*)(.+)$/);
      if (
        headingMatch &&
        /\b(bedroom|suite|bunk|loft|guest|kids|primary|secondary|master|basement|upstairs|downstairs)\b/i.test(
          headingMatch[1]
        )
      ) {
        roomName = headingMatch[1].trim();
        details = headingMatch[2].trim();
      }

      const bedType = detectBedType(details);
      const bedCountMatch =
        details.match(/(\d+)\s*(king|queen|full|double|twin|single|bunk|beds?|sofa bed|futon|daybed|murphy|trundle)/i) ??
        details.match(/(\d+)\s*beds?/i);
      const sleepsMatch =
        details.match(/sleeps?\s*(\d+)/i) ?? details.match(/(\d+)\s*(guests?|people|persons?)/i);

      return normalizeSleepingRoom(
        {
          roomName: roomName || `Bedroom ${index + 1}`,
          bedType,
          bedCount: bedCountMatch ? Number(bedCountMatch[1]) : 1,
          sleeps: sleepsMatch ? Number(sleepsMatch[1]) : undefined,
          notes: details,
        },
        index
      );
    })
    .filter((room) => room.roomName || room.notes || room.bedType);

  return parsed.length > 0 ? parsed : createDefaultSleepingRooms(fallbackCount);
}

export function coerceSleepingArrangements(
  value: unknown,
  fallbackCount: number
): SleepingArrangements {
  if (!isPlainObject(value)) {
    return {
      bedroomCount: normalizeBedroomCount(fallbackCount),
      rooms: [],
    };
  }

  const rawRooms = Array.isArray(value.rooms) ? value.rooms : [];
  const bedroomCount = normalizeBedroomCount(value.bedroomCount ?? (rawRooms.length || fallbackCount));

  return {
    bedroomCount,
    rooms: rawRooms.length > 0 ? createDefaultSleepingRooms(bedroomCount, rawRooms) : [],
  };
}
