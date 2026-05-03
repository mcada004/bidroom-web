import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStoredStravaConnection,
  decryptStoredStravaTokens,
  getStravaConnectionMetadata,
  parseStoredStravaConnection,
  sealStravaCookiePayload,
  unsealStravaCookiePayload,
} from "./stravaOAuth.ts";

process.env.STRAVA_TOKEN_ENCRYPTION_SECRET = "test-strava-encryption-secret";

test("stored Strava connections encrypt and decrypt access and refresh tokens", () => {
  const connection = buildStoredStravaConnection({
    athlete: {
      id: 42,
      username: "ridge-rider",
      firstname: "Ridge",
      lastname: "Rider",
      city: "San Francisco",
      state: "CA",
      country: "USA",
      profile: "https://example.com/profile.jpg",
      profileMedium: "https://example.com/profile-medium.jpg",
    },
    accessToken: "access-123",
    refreshToken: "refresh-456",
    expiresAt: 1_777_777_777,
    scopes: ["read"],
    connectedAt: "2026-05-03T15:00:00.000Z",
  });

  const parsed = parseStoredStravaConnection(connection);
  assert.ok(parsed);

  const tokens = decryptStoredStravaTokens(parsed);
  assert.equal(tokens.accessToken, "access-123");
  assert.equal(tokens.refreshToken, "refresh-456");
  assert.equal(tokens.expiresAt, 1_777_777_777);

  const metadata = getStravaConnectionMetadata(parsed);
  assert.equal(metadata.athleteName, "Ridge Rider");
  assert.deepEqual(metadata.scopes, ["read"]);
});

test("sealed cookie payloads round-trip", () => {
  const sealed = sealStravaCookiePayload({
    uid: "abc123",
    returnTo: "/account",
    connectedAt: "2026-05-03T15:00:00.000Z",
  });

  const parsed = unsealStravaCookiePayload<{
    uid: string;
    returnTo: string;
    connectedAt: string;
  }>(sealed);

  assert.equal(parsed.uid, "abc123");
  assert.equal(parsed.returnTo, "/account");
  assert.equal(parsed.connectedAt, "2026-05-03T15:00:00.000Z");
});
