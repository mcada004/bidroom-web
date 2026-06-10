import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RequestBody = {
  location?: unknown;
  ridingType?: unknown;
  goalMetric?: unknown;
  goalAmount?: unknown;
};

const VALID_RIDING_TYPES = ["road", "gravel", "both"] as const;
const VALID_GOAL_METRICS = ["miles", "climbing", "hours"] as const;

type RidingType = (typeof VALID_RIDING_TYPES)[number];
type GoalMetric = (typeof VALID_GOAL_METRICS)[number];

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

function goalLabel(metric: GoalMetric, amount: number): string {
  switch (metric) {
    case "miles":
      return `${amount} miles per day`;
    case "climbing":
      return `${amount} feet of climbing per day`;
    case "hours":
      return `${amount} hours of riding per day`;
  }
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const ridingType = typeof body.ridingType === "string" ? body.ridingType.trim().toLowerCase() : "";
  if (!VALID_RIDING_TYPES.includes(ridingType as RidingType)) {
    return NextResponse.json(
      { error: "ridingType must be one of: road, gravel, both." },
      { status: 400 }
    );
  }

  const goalMetric = typeof body.goalMetric === "string" ? body.goalMetric.trim().toLowerCase() : "";
  if (!VALID_GOAL_METRICS.includes(goalMetric as GoalMetric)) {
    return NextResponse.json(
      { error: "goalMetric must be one of: miles, climbing, hours." },
      { status: 400 }
    );
  }

  const goalAmount = Number(body.goalAmount);
  if (!Number.isFinite(goalAmount) || goalAmount <= 0) {
    return NextResponse.json(
      { error: "goalAmount must be a positive number." },
      { status: 400 }
    );
  }

  const location =
    typeof body.location === "string" ? body.location.trim() : "";

  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    return NextResponse.json(
      { error: "Server is missing OpenAI configuration." },
      { status: 500 }
    );
  }

  const locationClause = location
    ? `The user wants to ride in or near "${location}".`
    : "The user has no specific location in mind — suggest diverse, world-class cycling destinations.";

  const systemPrompt = [
    "You are a cycling trip advisor. Suggest 2-3 destination areas for a cycling trip.",
    `${locationClause}`,
    `Riding type: ${ridingType}.`,
    `Daily goal: ${goalLabel(goalMetric as GoalMetric, goalAmount)}.`,
    "For each destination, provide a short description of why it's great for the specified riding type, the best season to visit, and practical tips (logistics, gear, etc.).",
    "For each destination, suggest 2-3 specific rides with name, distance, climbing, estimated time, difficulty (Easy / Moderate / Hard / Epic), and a one-line description.",
    "Tailor ride distances and climbing to match the user's daily goal.",
  ].join(" ");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
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
                text: systemPrompt,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Suggest cycling trip destinations and rides based on my preferences.",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "bike_suggestions",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                destinations: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      description: { type: "string" },
                      bestSeason: { type: "string" },
                      tips: { type: "string" },
                      rides: {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            name: { type: "string" },
                            distance: { type: "string" },
                            climbing: { type: "string" },
                            estimatedTime: { type: "string" },
                            difficulty: { type: "string" },
                            description: { type: "string" },
                          },
                          required: [
                            "name",
                            "distance",
                            "climbing",
                            "estimatedTime",
                            "difficulty",
                            "description",
                          ],
                        },
                      },
                    },
                    required: [
                      "name",
                      "description",
                      "bestSeason",
                      "tips",
                      "rides",
                    ],
                  },
                },
              },
              required: ["destinations"],
            },
          },
        },
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      const errorMessage =
        (
          (payload.error as { message?: unknown } | undefined)
            ?.message as string | undefined
        ) ?? "Failed to generate suggestions.";
      throw new Error(errorMessage);
    }

    const rawText =
      (typeof payload.output_text === "string" && payload.output_text.trim()) ||
      extractOutputText(payload.output);
    if (!rawText) {
      throw new Error("Could not generate cycling suggestions.");
    }

    const parsed = JSON.parse(rawText) as { destinations?: unknown };
    if (!Array.isArray(parsed.destinations) || parsed.destinations.length === 0) {
      throw new Error("Could not generate cycling suggestions.");
    }

    return NextResponse.json({ ok: true, destinations: parsed.destinations });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate suggestions.",
      },
      { status: 422 }
    );
  }
}
