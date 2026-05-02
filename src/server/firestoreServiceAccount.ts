import { createSign } from "node:crypto";

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let cachedToken: CachedToken | null = null;

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getServiceAccountConfig() {
  const clientEmail = process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL ?? null;
  const privateKey = process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? null;
  const projectId =
    process.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null;

  if (!clientEmail || !privateKey || !projectId) return null;
  return { clientEmail, privateKey, projectId };
}

function createSignedJwt(config: { clientEmail: string; privateKey: string }) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: config.clientEmail,
      sub: config.clientEmail,
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/datastore",
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    })
  );

  const signer = createSign("RSA-SHA256");
  const signingInput = `${header}.${payload}`;
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(config.privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function isFirestoreServiceAccountConfigured() {
  return Boolean(getServiceAccountConfig());
}

export function getFirestoreProjectId() {
  return getServiceAccountConfig()?.projectId ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null;
}

export async function getFirestoreServiceAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > now) return cachedToken.accessToken;

  const config = getServiceAccountConfig();
  if (!config) {
    throw new Error("Firestore service account env vars are not configured.");
  }

  const assertion = createSignedJwt(config);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errorMessage =
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.error === "string"
          ? payload.error
          : "Unable to mint Firestore access token.";
    throw new Error(errorMessage);
  }

  const accessToken = payload.access_token;
  const expiresIn = payload.expires_in;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("OAuth response did not include an access token.");
  }

  cachedToken = {
    accessToken,
    expiresAtMs: now + (typeof expiresIn === "number" ? expiresIn : 3600) * 1000,
  };

  return accessToken;
}
