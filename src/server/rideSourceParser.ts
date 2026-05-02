import { createHash } from "node:crypto";
import type { RideSourceReport } from "../lib/groupRides.ts";
import type { RideSourceRegistryEntry } from "../lib/rideSources.ts";
import { fetchIntegrationRideSourceReport } from "./rideSourceIntegrations.ts";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 1_200_000;
const MAX_REDIRECTS = 4;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

type ParsedSourceContent = {
  parserStrategy: string;
  excerpt: string | null;
  extractedSchedule: string | null;
  extractedDistance: string | null;
  extractedDropPolicy: string | null;
  detectedDates: string[];
  detectedEventCount: number;
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToLines(value: string) {
  return decodeHtml(
    value
      .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n")
  )
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractTitle(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  const cleaned = stripTags(decodeHtml(match[1]));
  return cleaned || null;
}

function parseTagAttributes(tag: string) {
  const attrs: Record<string, string> = {};
  const attrRegex = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null = null;

  while ((match = attrRegex.exec(tag))) {
    const key = match[1]?.toLowerCase();
    if (!key) continue;
    const raw = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = decodeHtml(raw.trim());
  }

  return attrs;
}

function extractMetaContent(html: string, keys: string[]) {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const metaRegex = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = metaRegex.exec(html))) {
    const attrs = parseTagAttributes(match[0]);
    const candidateKey = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (!candidateKey || !keySet.has(candidateKey)) continue;
    const content = attrs.content?.trim();
    if (content) return content;
  }

  return null;
}

function findFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].replace(/\s+/g, " ").trim();
  }
  return null;
}

function extractDistance(text: string) {
  return findFirstMatch(text, [
    /\b\d{1,3}\s?(?:to|-)\s?\d{1,3}\s+miles?\b/i,
    /\babout\s+\d{1,3}\s+miles?\b/i,
    /\b\d{1,3}\s+miles?\b/i,
  ]);
}

function extractScheduleFromText(text: string) {
  return findFirstMatch(text, [
    /\b(?:Mondays?|Tuesdays?|Wednesdays?|Thursdays?|Fridays?|Saturdays?|Sundays?)\b[^.]{0,120}\b\d{1,2}(?::\d{2})?\s?(?:AM|PM)\b/i,
    /\b(?:Mondays?|Tuesdays?|Wednesdays?|Thursdays?|Fridays?|Saturdays?|Sundays?)\b[^.]{0,90}\b(?:meet|roll|start)\b[^.]{0,90}/i,
    /\b\d(?:st|nd|rd|th)\s+(?:Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\b[^.]{0,120}/i,
  ]);
}

function extractScheduleFromLines(lines: string[]) {
  for (const line of lines) {
    if (!/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(line)) continue;
    if (!/(am|pm|meet|roll|start|weekly|every)/i.test(line)) continue;
    if (line.length < 12) continue;
    return line.slice(0, 160);
  }
  return null;
}

function extractDropPolicy(text: string) {
  return findFirstMatch(text, [/\bno-drop\b/i, /\bregroups?\b[^.]{0,80}/i]);
}

function buildExcerpt(text: string) {
  if (!text) return null;
  const clipped = text.slice(0, 260).trim();
  return clipped || null;
}

function uniqueSortedDateKeys(values: string[]) {
  return [...new Set(values)].sort();
}

function toDateKey(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function extractIsoDateKeys(html: string) {
  const matches = html.match(/\b20\d{2}-\d{2}-\d{2}(?:[T ][0-2]\d:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-][0-2]\d:?\d{2})?)?\b/g) ?? [];
  return uniqueSortedDateKeys(
    matches.map((match) => toDateKey(match)).filter((dateKey): dateKey is string => Boolean(dateKey))
  );
}

function extractNaturalLanguageDateKeys(text: string) {
  const matches =
    text.match(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/g
    ) ?? [];
  return uniqueSortedDateKeys(
    matches.map((match) => toDateKey(match)).filter((dateKey): dateKey is string => Boolean(dateKey))
  );
}

function collectEventObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectEventObjects(entry));
  }

  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const typeValue = record["@type"];
  const typeValues = Array.isArray(typeValue) ? typeValue : [typeValue];
  const isEvent = typeValues.some((entry) => typeof entry === "string" && entry.toLowerCase() === "event");
  const nested = Object.values(record).flatMap((entry) => collectEventObjects(entry));
  return isEvent ? [record, ...nested] : nested;
}

function extractJsonLdEventDates(html: string) {
  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const dateKeys: string[] = [];
  let match: RegExpExecArray | null = null;

  while ((match = scriptRegex.exec(html))) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      const payload = JSON.parse(raw) as unknown;
      const events = collectEventObjects(payload);
      for (const event of events) {
        const startDate = event.startDate;
        if (typeof startDate !== "string") continue;
        const dateKey = toDateKey(startDate);
        if (dateKey) dateKeys.push(dateKey);
      }
    } catch {
      continue;
    }
  }

  return uniqueSortedDateKeys(dateKeys);
}

function detectParserStrategy(source: RideSourceRegistryEntry) {
  const url = source.url.toLowerCase();
  if (url.includes("tockify.com")) return "tockify-calendar";
  if (url.includes("wildapricot.org")) return "wildapricot-calendar";
  if (source.parserType === "recurring-page") return "recurring-page";
  if (source.parserType === "calendar-page") return "calendar-page";
  return "generic-page";
}

function summarizeDateKeys(dateKeys: string[]) {
  if (dateKeys.length === 0) return null;
  const formatted = dateKeys.slice(0, 3).map((dateKey) =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(`${dateKey}T12:00:00Z`))
  );
  return `Upcoming dates: ${formatted.join(", ")}`;
}

export function parseRideSourceContent(source: RideSourceRegistryEntry, html: string, pageDescription: string | null) {
  const parserStrategy = detectParserStrategy(source);
  const text = stripTags(decodeHtml(html));
  const lines = htmlToLines(html);
  const jsonLdDateKeys = extractJsonLdEventDates(html);
  const isoDateKeys = extractIsoDateKeys(html);
  const naturalDateKeys = extractNaturalLanguageDateKeys(text);
  const detectedDates = uniqueSortedDateKeys([...jsonLdDateKeys, ...isoDateKeys, ...naturalDateKeys]).slice(0, 24);

  const scheduleFromText = extractScheduleFromText(text);
  const scheduleFromLines = extractScheduleFromLines(lines);
  const extractedDistance = extractDistance(text);
  const extractedDropPolicy = extractDropPolicy(text);

  const extractedSchedule =
    parserStrategy === "tockify-calendar" || parserStrategy === "wildapricot-calendar"
      ? summarizeDateKeys(detectedDates) ?? scheduleFromText ?? scheduleFromLines
      : scheduleFromText ?? scheduleFromLines ?? null;

  const excerptSource =
    pageDescription ??
    lines.find((line) => /(ride|calendar|event|club|group)/i.test(line) && line.length >= 24) ??
    text;

  return {
    parserStrategy,
    excerpt: buildExcerpt(excerptSource),
    extractedSchedule,
    extractedDistance,
    extractedDropPolicy,
    detectedDates,
    detectedEventCount: detectedDates.length,
  } satisfies ParsedSourceContent;
}

async function fetchHtml(url: string) {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
      });

      const isRedirect = response.status >= 300 && response.status < 400;
      if (isRedirect) {
        const location = response.headers.get("location");
        if (!location) {
          return {
            ok: false as const,
            httpStatus: response.status,
            finalUrl: currentUrl,
            html: "",
            error: "Redirect missing location header.",
          };
        }

        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      const bodyText = await response.text();
      const clippedHtml = bodyText.slice(0, MAX_HTML_BYTES);

      if (!response.ok) {
        return {
          ok: false as const,
          httpStatus: response.status,
          finalUrl: response.url || currentUrl,
          html: clippedHtml,
          error: `Remote server returned ${response.status}.`,
        };
      }

      return {
        ok: true as const,
        httpStatus: response.status,
        finalUrl: response.url || currentUrl,
        html: clippedHtml,
      };
    } catch (error) {
      return {
        ok: false as const,
        httpStatus: null,
        finalUrl: currentUrl,
        html: "",
        error: error instanceof Error ? error.message : "Request failed.",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    ok: false as const,
    httpStatus: null,
    finalUrl: currentUrl,
    html: "",
    error: "Too many redirects.",
  };
}

export async function fetchRideSourceReport(source: RideSourceRegistryEntry): Promise<RideSourceReport> {
  const integrationReport = await fetchIntegrationRideSourceReport(source);
  if (integrationReport && (source.syncMode !== "crawl" || integrationReport.status !== "skipped")) {
    return integrationReport;
  }

  const fetchedAt = new Date().toISOString();

  if (source.syncMode !== "crawl") {
    return {
      sourceId: source.id,
      rideId: source.rideId,
      label: source.label,
      url: source.url,
      finalUrl: null,
      parserType: source.parserType,
      parserStrategy: integrationReport?.parserStrategy ?? null,
      syncMode: source.syncMode,
      transport: integrationReport ? "integration" : "crawl",
      integrationProvider: integrationReport?.integrationProvider ?? null,
      fetchedAt,
      status: "skipped",
      ok: true,
      httpStatus: null,
      pageTitle: null,
      pageDescription: null,
      excerpt: source.notes ?? null,
      extractedSchedule: null,
      extractedDistance: null,
      extractedDropPolicy: null,
      detectedEventCount: 0,
      detectedDates: [],
      contentHash: null,
      error: null,
      skippedReason:
        integrationReport?.skippedReason ??
        (source.syncMode === "manual"
          ? "Manual source: use organizer page or authenticated integration."
          : "API reference: not crawled as an HTML ride source."),
    };
  }

  const fetched = await fetchHtml(source.url);

  if (!fetched.ok) {
    return {
      sourceId: source.id,
      rideId: source.rideId,
      label: source.label,
      url: source.url,
      finalUrl: fetched.finalUrl,
      parserType: source.parserType,
      parserStrategy: detectParserStrategy(source),
      syncMode: source.syncMode,
      transport: "crawl",
      integrationProvider: null,
      fetchedAt,
      status: "failed",
      ok: false,
      httpStatus: fetched.httpStatus,
      pageTitle: null,
      pageDescription: null,
      excerpt: null,
      extractedSchedule: null,
      extractedDistance: null,
      extractedDropPolicy: null,
      detectedEventCount: 0,
      detectedDates: [],
      contentHash: null,
      error: fetched.error,
      skippedReason: null,
    };
  }

  const html = fetched.html;
  const pageTitle = extractTitle(html);
  const pageDescription = extractMetaContent(html, ["description", "og:description"]);
  const parsed = parseRideSourceContent(source, html, pageDescription);

  return {
    sourceId: source.id,
    rideId: source.rideId,
    label: source.label,
    url: source.url,
    finalUrl: fetched.finalUrl,
    parserType: source.parserType,
    parserStrategy: parsed.parserStrategy,
    syncMode: source.syncMode,
    transport: "crawl",
    integrationProvider: null,
    fetchedAt,
    status: "fetched",
    ok: true,
    httpStatus: fetched.httpStatus,
    pageTitle,
    pageDescription,
    excerpt: parsed.excerpt,
    extractedSchedule: parsed.extractedSchedule,
    extractedDistance: parsed.extractedDistance,
    extractedDropPolicy: parsed.extractedDropPolicy,
    detectedEventCount: parsed.detectedEventCount,
    detectedDates: parsed.detectedDates,
    contentHash: createHash("sha256").update(html).digest("hex"),
    error: null,
    skippedReason: null,
  };
}

export async function fetchRideSourceReports(sources: RideSourceRegistryEntry[]) {
  return Promise.all(sources.map((source) => fetchRideSourceReport(source)));
}
