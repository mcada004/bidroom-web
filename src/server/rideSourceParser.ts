import { createHash } from "node:crypto";
import type { RideSourceReport } from "@/src/lib/groupRides";
import type { RideSourceRegistryEntry } from "@/src/lib/rideSources";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 1_200_000;
const MAX_REDIRECTS = 4;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, " ");
}

function stripTags(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function extractSchedule(text: string) {
  return findFirstMatch(text, [
    /\b(?:Mondays?|Tuesdays?|Wednesdays?|Thursdays?|Fridays?|Saturdays?|Sundays?)\b[^.]{0,120}\b\d{1,2}(?::\d{2})?\s?(?:AM|PM)\b/i,
    /\b(?:Mondays?|Tuesdays?|Wednesdays?|Thursdays?|Fridays?|Saturdays?|Sundays?)\b[^.]{0,80}\bmeet\b[^.]{0,60}/i,
    /\b\d(?:st|nd|rd|th)\s+(?:Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\b[^.]{0,120}/i,
  ]);
}

function extractDropPolicy(text: string) {
  return findFirstMatch(text, [/\bno-drop\b/i, /\bregroups?\b[^.]{0,80}/i]);
}

function buildExcerpt(text: string) {
  if (!text) return null;
  const clipped = text.slice(0, 260).trim();
  return clipped || null;
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
          return { ok: false as const, httpStatus: response.status, finalUrl: currentUrl, html: "", error: "Redirect missing location header." };
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
  const fetchedAt = new Date().toISOString();

  if (source.syncMode !== "crawl") {
    return {
      sourceId: source.id,
      rideId: source.rideId,
      label: source.label,
      url: source.url,
      parserType: source.parserType,
      syncMode: source.syncMode,
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
      contentHash: null,
      error: null,
      skippedReason:
        source.syncMode === "manual"
          ? "Manual source: use organizer page or authenticated integration."
          : "API reference: not crawled as an HTML ride source.",
    };
  }

  const fetched = await fetchHtml(source.url);

  if (!fetched.ok) {
    return {
      sourceId: source.id,
      rideId: source.rideId,
      label: source.label,
      url: source.url,
      parserType: source.parserType,
      syncMode: source.syncMode,
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
      contentHash: null,
      error: fetched.error,
      skippedReason: null,
    };
  }

  const html = fetched.html;
  const pageTitle = extractTitle(html);
  const pageDescription = extractMetaContent(html, ["description", "og:description"]);
  const text = stripTags(decodeHtml(html));
  const excerpt = buildExcerpt(pageDescription ?? text);

  return {
    sourceId: source.id,
    rideId: source.rideId,
    label: source.label,
    url: source.url,
    parserType: source.parserType,
    syncMode: source.syncMode,
    fetchedAt,
    status: "fetched",
    ok: true,
    httpStatus: fetched.httpStatus,
    pageTitle,
    pageDescription,
    excerpt,
    extractedSchedule: extractSchedule(text),
    extractedDistance: extractDistance(text),
    extractedDropPolicy: extractDropPolicy(text),
    contentHash: createHash("sha256").update(html).digest("hex"),
    error: null,
    skippedReason: null,
  };
}

export async function fetchRideSourceReports(sources: RideSourceRegistryEntry[]) {
  return Promise.all(sources.map((source) => fetchRideSourceReport(source)));
}
