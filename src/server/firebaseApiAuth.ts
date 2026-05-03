import { verifyFirebaseIdToken } from "@/src/server/firestoreRest";

export function getBearerToken(authHeader: string | null) {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  const token = match[1].trim();
  return token || null;
}

export function getFirebaseServerConfig() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!projectId) throw new Error("Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
  if (!firebaseApiKey) throw new Error("Missing NEXT_PUBLIC_FIREBASE_API_KEY.");

  return {
    projectId,
    firebaseApiKey,
  };
}

export async function verifyBearerFirebaseUser(authHeader: string | null) {
  const token = getBearerToken(authHeader);
  if (!token) {
    throw new Error("Missing Authorization bearer token.");
  }

  const config = getFirebaseServerConfig();
  const uid = await verifyFirebaseIdToken(token, config.firebaseApiKey);
  return {
    uid,
    idToken: token,
    config,
  };
}
