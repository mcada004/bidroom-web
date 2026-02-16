import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { toFirestoreValue, verifyFirebaseIdToken } from "@/src/server/firestoreRest";

export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2048;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type LinkPreviewResponse = {
  url: string;
  title: string | null;
  image: string | null;
  description: string | null;
  siteName: string | null;
  hostname: string;
  fetchedAt: number;
};

type RequestBody = {
  url?: unknown;
};

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  const token = match[1].trim();
  return token || null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
    const tag = match[0];
    const attrs = parseTagAttributes(tag);
    const candidateKey = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (!candidateKey || !keySet.has(candidateKey)) continue;

    const content = attrs.content?.trim();
    if (content) return content;
  }

  return null;
}

function extractTitle(html: string) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch?.[1]) return null;
  const cleaned = stripTags(decodeHtml(titleMatch[1]));
  return cleaned || null;
}

function toAbsoluteUrl(input: string | null, baseUrl: string) {
  if (!input) return null;
  try {
    return new URL(input, baseUrl).toString();
  } catch {
    return null;
  }
}

function isPrivateOrLocalIp(ip: string) {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const parts = ip.split(".").map((value) => Number(value));
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return true;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (kind === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      return isPrivateOrLocalIp(mapped);
    }
    return false;
  }

  return false;
}

async function assertPublicHostname(hostname: string) {
  const host = hostname.trim().toLowerCase();
  if (!host) throw new Error("Invalid URL host.");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Local/private hosts are not allowed.");
  }

  if (net.isIP(host) && isPrivateOrLocalIp(host)) {
    throw new Error("Private IP hosts are not allowed.");
  }

  if (!net.isIP(host)) {
    try {
      const entries = await lookup(host, { all: true, verbatim: true });
      for (const entry of entries) {
        if (isPrivateOrLocalIp(entry.address)) {
          throw new Error("Host resolves to a private IP address.");
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("private IP")) throw error;
      // DNS lookup can fail for transient reasons; fetch will surface this later.
    }
  }
}

async function validateAndNormalizeUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error("URL is required.");
  if (trimmed.length > MAX_URL_LENGTH) throw new Error("URL is too long.");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must start with http:// or https://.");
  }

  parsed.hash = "";
  await assertPublicHostname(parsed.hostname);
  return parsed;
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseBodyWithLimit(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let output = "";
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    bytesRead += value.byteLength;
    if (bytesRead > MAX_HTML_BYTES) throw new Error("Response body exceeds max size.");
    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

async function fetchHtmlWithRedirects(startUrl: string) {
  let currentUrl = startUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchWithTimeout(currentUrl);
    const isRedirect = response.status >= 300 && response.status < 400;

    if (isRedirect) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response missing location header.");
      if (redirectCount >= MAX_REDIRECTS) throw new Error("Too many redirects.");

      const nextUrl = new URL(location, currentUrl).toString();
      const validatedNext = await validateAndNormalizeUrl(nextUrl);
      currentUrl = validatedNext.toString();
      continue;
    }

    if (!response.ok) throw new Error(`Remote server returned ${response.status}.`);
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      throw new Error("URL did not return an HTML document.");
    }

    const html = await readResponseBodyWithLimit(response);
    return { html, finalUrl: response.url || currentUrl };
  }

  throw new Error("Unable to fetch URL.");
}

function parseLinkPreview(url: string, html: string, finalUrl: string): LinkPreviewResponse {
  const ogTitle = extractMetaContent(html, ["og:title"]);
  const ogImage = extractMetaContent(html, ["og:image", "og:image:url"]);
  const ogDescription = extractMetaContent(html, ["og:description"]);
  const ogSiteName = extractMetaContent(html, ["og:site_name"]);
  const fallbackDescription = extractMetaContent(html, ["description"]);
  const fallbackTitle = extractTitle(html);
  const resolved = new URL(finalUrl);

  return {
    url,
    title: ogTitle || fallbackTitle || null,
    image: toAbsoluteUrl(ogImage, finalUrl),
    description: ogDescription || fallbackDescription || null,
    siteName: ogSiteName || null,
    hostname: resolved.hostname,
    fetchedAt: Date.now(),
  };
}

function hashUrl(url: string) {
  return createHash("sha256").update(url).digest("hex");
}

function buildCacheDocumentUrl(projectId: string, docId: string) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/linkPreviews/${docId}`;
}

function fieldAsString(field: unknown) {
  const value = field as Record<string, unknown> | null;
  return typeof value?.stringValue === "string" ? value.stringValue : null;
}

function fieldAsNumber(field: unknown) {
  const value = field as Record<string, unknown> | null;
  if (typeof value?.integerValue === "string") {
    const parsed = Number(value.integerValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value?.doubleValue === "number" && Number.isFinite(value.doubleValue)) {
    return value.doubleValue;
  }
  return null;
}

function parseCachedPreview(fields: unknown): LinkPreviewResponse | null {
  const asFields = fields as Record<string, unknown> | null;
  if (!asFields) return null;

  const url = fieldAsString(asFields.url);
  const hostname = fieldAsString(asFields.hostname);
  const fetchedAt = fieldAsNumber(asFields.fetchedAt);
  if (!url || !hostname || typeof fetchedAt !== "number") return null;

  return {
    url,
    title: fieldAsString(asFields.title),
    image: fieldAsString(asFields.image),
    description: fieldAsString(asFields.description),
    siteName: fieldAsString(asFields.siteName),
    hostname,
    fetchedAt,
  };
}

async function readCachedPreview(projectId: string, idToken: string, docId: string) {
  const response = await fetch(buildCacheDocumentUrl(projectId, docId), {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (response.status === 404) return null;
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const preview = parseCachedPreview(payload.fields);
  if (!preview) return null;
  if (Date.now() - preview.fetchedAt >= CACHE_TTL_MS) return null;
  return preview;
}

async function writeCachedPreview(projectId: string, idToken: string, docId: string, preview: LinkPreviewResponse) {
  const fields: Record<string, ReturnType<typeof toFirestoreValue>> = {};
  for (const [key, value] of Object.entries(preview)) {
    fields[key] = toFirestoreValue(value);
  }

  await fetch(buildCacheDocumentUrl(projectId, docId), {
    method: "PATCH",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const rawUrl = asNonEmptyString(body.url);
  if (!rawUrl) {
    return NextResponse.json({ error: "url is required." }, { status: 400 });
  }

  let normalizedUrl: URL;
  try {
    normalizedUrl = await validateAndNormalizeUrl(rawUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const canonicalUrl = normalizedUrl.toString();
  const cacheId = hashUrl(canonicalUrl);

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null;
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? null;
  const bearerToken = getBearerToken(request.headers.get("authorization"));
  let verifiedToken: string | null = null;

  if (projectId && firebaseApiKey && bearerToken) {
    try {
      await verifyFirebaseIdToken(bearerToken, firebaseApiKey);
      verifiedToken = bearerToken;
    } catch {
      verifiedToken = null;
    }
  }

  if (projectId && verifiedToken) {
    const cached = await readCachedPreview(projectId, verifiedToken, cacheId);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  try {
    const { html, finalUrl } = await fetchHtmlWithRedirects(canonicalUrl);
    const preview = parseLinkPreview(canonicalUrl, html, finalUrl);

    if (projectId && verifiedToken) {
      try {
        await writeCachedPreview(projectId, verifiedToken, cacheId, preview);
      } catch {
        // Best effort cache write.
      }
    }

    return NextResponse.json(preview);
  } catch {
    return NextResponse.json(
      { error: "Couldn’t fetch preview (some sites block previews). You can still use the link." },
      { status: 422 }
    );
  }
}
