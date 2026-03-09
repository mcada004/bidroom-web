import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/src/server/firestoreRest";
import { normalizeSleepingRoom } from "@/src/lib/sleepingArrangements";
import type { SleepingRoom } from "@/src/lib/sleepingArrangements";

export const runtime = "nodejs";

type RequestBody = {
  imageDataUrl?: unknown;
};

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  return match[1].trim() || null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getConfig() {
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (!firebaseApiKey) throw new Error("Missing NEXT_PUBLIC_FIREBASE_API_KEY.");
  if (!openAiApiKey) {
    throw new Error("Missing OPENAI_API_KEY. Paste bedroom text instead, or configure screenshot import.");
  }

  return {
    firebaseApiKey,
    openAiApiKey,
  };
}

function extractOutputText(value: unknown): string {
  if (!Array.isArray(value)) return "";

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text =
        (part as { text?: unknown }).text ??
        (part as { output_text?: unknown }).output_text;
      if (typeof text === "string" && text.trim()) {
        return text;
      }
    }
  }

  return "";
}

function parseRooms(payload: unknown): SleepingRoom[] {
  const asObject = payload as { rooms?: unknown } | null;
  if (!Array.isArray(asObject?.rooms)) return [];
  return asObject.rooms.map((room, index) => normalizeSleepingRoom(room, index));
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization bearer token." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const imageDataUrl = asNonEmptyString(body.imageDataUrl);
  if (!imageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl is required." }, { status: 400 });
  }

  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server is missing screenshot import configuration." },
      { status: 500 }
    );
  }

  try {
    await verifyFirebaseIdToken(token, config.firebaseApiKey);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify auth token." },
      { status: 401 }
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        store: false,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Extract sleeping arrangement room cards from lodging screenshots. Return bedrooms or sleeping areas only. Use blank bedType if unknown. Keep notes short and factual.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Parse this screenshot into suggested sleeping-arrangement room cards.",
              },
              {
                type: "input_image",
                image_url: imageDataUrl,
                detail: "auto",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "sleeping_arrangements",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                rooms: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      roomName: { type: "string" },
                      bedType: { type: "string" },
                      bedCount: { type: "integer" },
                      sleeps: { type: "integer" },
                      notes: { type: "string" },
                    },
                    required: ["roomName", "bedType", "bedCount", "sleeps", "notes"],
                  },
                },
              },
              required: ["rooms"],
            },
          },
        },
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errorMessage =
        ((payload.error as { message?: unknown } | undefined)?.message as string | undefined) ??
        "Screenshot import failed.";
      throw new Error(errorMessage);
    }

    const rawText =
      (typeof payload.output_text === "string" && payload.output_text.trim()) ||
      extractOutputText(payload.output);
    if (!rawText) {
      throw new Error("The screenshot could not be parsed into room cards.");
    }

    const parsed = JSON.parse(rawText) as { rooms?: unknown };
    const rooms = parseRooms(parsed);
    if (rooms.length === 0) {
      throw new Error("The screenshot could not be parsed into room cards.");
    }

    return NextResponse.json({ ok: true, rooms });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Screenshot import failed." },
      { status: 422 }
    );
  }
}
