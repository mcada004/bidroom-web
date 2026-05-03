import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token";
const STRAVA_DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize";
const STRAVA_API_BASE_URL = "https://www.strava.com/api/v3";
const DEFAULT_STRAVA_SCOPES = ["read"];
const TOKEN_REFRESH_BUFFER_SECONDS = 300;

type CipherEnvelope = {
  iv: string;
  tag: string;
  value: string;
};

export type StravaAthleteSummary = {
  id: number;
  username: string | null;
  firstname: string | null;
  lastname: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  profile: string | null;
  profileMedium: string | null;
};

export type StoredStravaConnection = {
  athleteId: number;
  athleteUsername: string | null;
  athleteName: string;
  athleteCity: string | null;
  athleteState: string | null;
  athleteCountry: string | null;
  athleteProfile: string | null;
  athleteProfileMedium: string | null;
  scopes: string[];
  connectedAt: string;
  expiresAt: number;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
};

export type StravaConnectionMetadata = Omit<
  StoredStravaConnection,
  "accessTokenCiphertext" | "refreshTokenCiphertext"
>;

export type StravaTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type StravaClubSummary = {
  id: number;
  name: string;
  sportType: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  memberCount: number | null;
  profileMedium: string | null;
  coverPhoto: string | null;
  url: string | null;
};

export type StravaClubActivitySummary = {
  id: number | null;
  title: string;
  sportType: string | null;
  distanceMiles: number | null;
  date: string | null;
  url: string | null;
};

type StravaTokenExchangeResponse = {
  token_type?: unknown;
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  athlete?: unknown;
};

function getEnv(name: string) {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getRequiredEnv(name: string) {
  const value = getEnv(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function base64UrlEncode(value: Buffer | string) {
  const source = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return source.toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url");
}

function getEncryptionKey() {
  const secret = getRequiredEnv("STRAVA_TOKEN_ENCRYPTION_SECRET");
  return createHash("sha256").update(secret).digest();
}

function sealPayload<T>(payload: T) {
  const iv = randomBytes(12);
  const key = getEncryptionKey();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return base64UrlEncode(JSON.stringify({
    iv: base64UrlEncode(iv),
    tag: base64UrlEncode(tag),
    value: base64UrlEncode(encrypted),
  } satisfies CipherEnvelope));
}

function unsealPayload<T>(sealed: string): T {
  const decoded = JSON.parse(base64UrlDecode(sealed).toString("utf8")) as CipherEnvelope;
  if (!decoded?.iv || !decoded?.tag || !decoded?.value) {
    throw new Error("Encrypted payload is malformed.");
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, base64UrlDecode(decoded.iv));
  decipher.setAuthTag(base64UrlDecode(decoded.tag));
  const plaintext = Buffer.concat([
    decipher.update(base64UrlDecode(decoded.value)),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext) as T;
}

export function getStravaScopes() {
  const configured = getEnv("STRAVA_CONNECT_SCOPES");
  if (!configured) return DEFAULT_STRAVA_SCOPES;
  return configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isStravaOAuthConfigured() {
  return Boolean(
    getEnv("STRAVA_CLIENT_ID") &&
      getEnv("STRAVA_CLIENT_SECRET") &&
      getEnv("STRAVA_REDIRECT_URI") &&
      getEnv("STRAVA_TOKEN_ENCRYPTION_SECRET") &&
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

export function buildStravaAuthorizeUrl(state: string) {
  const clientId = getRequiredEnv("STRAVA_CLIENT_ID");
  const redirectUri = getRequiredEnv("STRAVA_REDIRECT_URI");
  const url = new URL(STRAVA_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", getStravaScopes().join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asRequiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Strava ${label} was missing from the OAuth response.`);
  }
  return value;
}

function asRequiredNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Strava ${label} was missing from the OAuth response.`);
  }
  return value;
}

function parseAthleteSummary(value: unknown): StravaAthleteSummary {
  const athlete = (value ?? {}) as Record<string, unknown>;
  const firstname = asNullableString(athlete.firstname);
  const lastname = asNullableString(athlete.lastname);
  return {
    id: asRequiredNumber(athlete.id, "athlete id"),
    username: asNullableString(athlete.username),
    firstname,
    lastname,
    city: asNullableString(athlete.city),
    state: asNullableString(athlete.state),
    country: asNullableString(athlete.country),
    profile: asNullableString(athlete.profile),
    profileMedium: asNullableString(athlete.profile_medium),
  };
}

function buildAthleteName(athlete: StravaAthleteSummary) {
  const pieces = [athlete.firstname, athlete.lastname].filter(Boolean);
  return pieces.join(" ").trim() || athlete.username || `Athlete ${athlete.id}`;
}

async function postTokenExchange(body: URLSearchParams) {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : `Strava token exchange failed with ${response.status}.`;
    throw new Error(message);
  }

  return payload as StravaTokenExchangeResponse;
}

export async function exchangeStravaAuthorizationCode(code: string) {
  const clientId = getRequiredEnv("STRAVA_CLIENT_ID");
  const clientSecret = getRequiredEnv("STRAVA_CLIENT_SECRET");
  const payload = await postTokenExchange(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    })
  );

  const athlete = parseAthleteSummary(payload.athlete);
  return {
    athlete,
    accessToken: asRequiredString(payload.access_token, "access token"),
    refreshToken: asRequiredString(payload.refresh_token, "refresh token"),
    expiresAt: asRequiredNumber(payload.expires_at, "expiration"),
  };
}

export async function refreshStravaToken(refreshToken: string) {
  const clientId = getRequiredEnv("STRAVA_CLIENT_ID");
  const clientSecret = getRequiredEnv("STRAVA_CLIENT_SECRET");
  const payload = await postTokenExchange(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );

  return {
    accessToken: asRequiredString(payload.access_token, "access token"),
    refreshToken: asRequiredString(payload.refresh_token, "refresh token"),
    expiresAt: asRequiredNumber(payload.expires_at, "expiration"),
    athlete: payload.athlete ? parseAthleteSummary(payload.athlete) : null,
  };
}

export function buildStoredStravaConnection(input: {
  athlete: StravaAthleteSummary;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  connectedAt: string;
}): StoredStravaConnection {
  return {
    athleteId: input.athlete.id,
    athleteUsername: input.athlete.username,
    athleteName: buildAthleteName(input.athlete),
    athleteCity: input.athlete.city,
    athleteState: input.athlete.state,
    athleteCountry: input.athlete.country,
    athleteProfile: input.athlete.profile,
    athleteProfileMedium: input.athlete.profileMedium,
    scopes: input.scopes,
    connectedAt: input.connectedAt,
    expiresAt: input.expiresAt,
    accessTokenCiphertext: sealPayload(input.accessToken),
    refreshTokenCiphertext: sealPayload(input.refreshToken),
  };
}

export function getStravaConnectionMetadata(connection: StoredStravaConnection): StravaConnectionMetadata {
  return {
    athleteId: connection.athleteId,
    athleteUsername: connection.athleteUsername,
    athleteName: connection.athleteName,
    athleteCity: connection.athleteCity,
    athleteState: connection.athleteState,
    athleteCountry: connection.athleteCountry,
    athleteProfile: connection.athleteProfile,
    athleteProfileMedium: connection.athleteProfileMedium,
    scopes: connection.scopes,
    connectedAt: connection.connectedAt,
    expiresAt: connection.expiresAt,
  };
}

export function parseStoredStravaConnection(value: unknown): StoredStravaConnection | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.athleteId !== "number" ||
    typeof record.athleteName !== "string" ||
    !Array.isArray(record.scopes) ||
    typeof record.connectedAt !== "string" ||
    typeof record.expiresAt !== "number" ||
    typeof record.accessTokenCiphertext !== "string" ||
    typeof record.refreshTokenCiphertext !== "string"
  ) {
    return null;
  }

  return {
    athleteId: record.athleteId,
    athleteUsername: asNullableString(record.athleteUsername),
    athleteName: record.athleteName,
    athleteCity: asNullableString(record.athleteCity),
    athleteState: asNullableString(record.athleteState),
    athleteCountry: asNullableString(record.athleteCountry),
    athleteProfile: asNullableString(record.athleteProfile),
    athleteProfileMedium: asNullableString(record.athleteProfileMedium),
    scopes: record.scopes.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0),
    connectedAt: record.connectedAt,
    expiresAt: record.expiresAt,
    accessTokenCiphertext: record.accessTokenCiphertext,
    refreshTokenCiphertext: record.refreshTokenCiphertext,
  };
}

export function decryptStoredStravaTokens(connection: StoredStravaConnection): StravaTokenSet {
  return {
    accessToken: unsealPayload<string>(connection.accessTokenCiphertext),
    refreshToken: unsealPayload<string>(connection.refreshTokenCiphertext),
    expiresAt: connection.expiresAt,
  };
}

export function replaceStoredStravaTokens(
  connection: StoredStravaConnection,
  tokens: StravaTokenSet,
  athlete: StravaAthleteSummary | null = null
) {
  return buildStoredStravaConnection({
    athlete:
      athlete ??
      {
        id: connection.athleteId,
        username: connection.athleteUsername,
        firstname: connection.athleteName.split(" ").slice(0, 1).join(" ") || connection.athleteName,
        lastname: connection.athleteName.split(" ").slice(1).join(" ") || null,
        city: connection.athleteCity,
        state: connection.athleteState,
        country: connection.athleteCountry,
        profile: connection.athleteProfile,
        profileMedium: connection.athleteProfileMedium,
      },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    scopes: connection.scopes,
    connectedAt: connection.connectedAt,
  });
}

export async function ensureFreshStravaTokens(connection: StoredStravaConnection) {
  const tokens = decryptStoredStravaTokens(connection);
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt > now + TOKEN_REFRESH_BUFFER_SECONDS) {
    return { tokens, nextConnection: connection, refreshed: false as const };
  }

  const refreshed = await refreshStravaToken(tokens.refreshToken);
  const nextTokens = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
  } satisfies StravaTokenSet;

  return {
    tokens: nextTokens,
    nextConnection: replaceStoredStravaTokens(connection, nextTokens, refreshed.athlete),
    refreshed: true as const,
  };
}

export async function deauthorizeStravaConnection(accessToken: string) {
  const response = await fetch(STRAVA_DEAUTHORIZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      access_token: accessToken,
    }).toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const message = typeof payload.message === "string" ? payload.message : `Strava deauthorization failed with ${response.status}.`;
    throw new Error(message);
  }
}

async function fetchStravaJson<T>(path: string, accessToken: string) {
  const response = await fetch(`${STRAVA_API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> | unknown[];
  if (!response.ok) {
    const asRecord = !Array.isArray(payload) ? payload : null;
    const message = typeof asRecord?.message === "string" ? asRecord.message : `Strava request failed with ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
}

export async function fetchStravaAthleteClubs(accessToken: string, perPage = 12) {
  const payload = await fetchStravaJson<unknown[]>(`/athlete/clubs?per_page=${perPage}`, accessToken);
  return payload.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    return {
      id: typeof record.id === "number" ? record.id : 0,
      name: typeof record.name === "string" ? record.name : "Unnamed club",
      sportType: asNullableString(record.sport_type),
      city: asNullableString(record.city),
      state: asNullableString(record.state),
      country: asNullableString(record.country),
      memberCount: typeof record.member_count === "number" ? record.member_count : null,
      profileMedium: asNullableString(record.profile_medium),
      coverPhoto: asNullableString(record.cover_photo),
      url: asNullableString(record.url),
    } satisfies StravaClubSummary;
  }).filter((club) => club.id > 0);
}

export async function fetchStravaClubActivities(accessToken: string, clubId: number, perPage = 3) {
  const payload = await fetchStravaJson<unknown[]>(`/clubs/${clubId}/activities?per_page=${perPage}`, accessToken);
  return payload.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const distanceMeters = typeof record.distance === "number" ? record.distance : null;
    return {
      id: typeof record.id === "number" ? record.id : null,
      title: typeof record.name === "string" ? record.name : "Recent club activity",
      sportType: asNullableString(record.sport_type) ?? asNullableString(record.type),
      distanceMiles: distanceMeters === null ? null : Math.round((distanceMeters / 1609.344) * 10) / 10,
      date: asNullableString(record.start_date_local) ?? asNullableString(record.start_date),
      url: typeof record.id === "number" ? `https://www.strava.com/activities/${record.id}` : null,
    } satisfies StravaClubActivitySummary;
  });
}

export function createStravaState() {
  return randomBytes(18).toString("base64url");
}

export function sealStravaCookiePayload<T>(payload: T) {
  return sealPayload(payload);
}

export function unsealStravaCookiePayload<T>(value: string) {
  return unsealPayload<T>(value);
}
