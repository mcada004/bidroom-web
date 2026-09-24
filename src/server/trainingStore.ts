import { TRAINING_OWNER_EMAIL, validateTrainingSnapshot, type TrainingSnapshot } from "@/src/lib/training";
import { getBearerToken, getFirebaseServerConfig } from "@/src/server/firebaseApiAuth";
import { fromFirestoreValue, toFirestoreValue } from "@/src/server/firestoreRest";
import { createTrainingKey, decryptTraining, type TrainingKey } from "@/src/server/trainingCrypto";

export class TrainingError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
type Owner = { uid: string; idToken: string; projectId: string };
export async function verifyTrainingOwner(authHeader: string | null): Promise<Owner> {
  const idToken = getBearerToken(authHeader);
  if (!idToken) throw new TrainingError("Sign in to view your training plan.", 401);
  const { projectId, firebaseApiKey } = getFirebaseServerConfig();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }), cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new TrainingError("Your session expired. Please sign in again.", 401);
  const data = await response.json();
  const user = data.users?.[0];
  if (!user?.localId || user.email?.toLowerCase() !== TRAINING_OWNER_EMAIL || user.disabled) throw new TrainingError("This training plan is private to its owner.", 403);
  return { uid: user.localId, idToken, projectId };
}
function userUrl(owner: Owner) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(owner.projectId)}/databases/(default)/documents/users/${encodeURIComponent(owner.uid)}`;
}
async function readProfile(owner: Owner) {
  const response = await fetch(userUrl(owner), { headers: { Authorization: `Bearer ${owner.idToken}` }, cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (response.status === 404) return { fields: {} as Record<string, unknown>, updateTime: null as string | null };
  if (!response.ok) throw new TrainingError("Your private plan could not be loaded. Try again shortly.", 503);
  const doc = await response.json();
  return { fields: Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, fromFirestoreValue(v)])), updateTime: doc.updateTime as string };
}
function getConnection(fields: Record<string, unknown>) {
  const value = fields.trainingConnection as TrainingKey | undefined;
  return value?.privateKey && value.publicKey && value.keyId ? value : null;
}
export async function initializeTraining(owner: Owner, snapshot: unknown) {
  validateTrainingSnapshot(snapshot);
  const profile = await readProfile(owner);
  const existing = profile.fields.trainingSeed as TrainingSnapshot | undefined;
  if (existing && (snapshot.recordVersion < existing.recordVersion || Date.parse(snapshot.generatedAt) < Date.parse(existing.generatedAt))) throw new TrainingError("This import is older than your saved plan.", 409);
  const key = getConnection(profile.fields) ?? createTrainingKey();
  const url = new URL(userUrl(owner));
  for (const field of ["trainingConnection", "trainingSeed"]) url.searchParams.append("updateMask.fieldPaths", field);
  url.searchParams.set(profile.updateTime ? "currentDocument.updateTime" : "currentDocument.exists", profile.updateTime ?? "false");
  const response = await fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${owner.idToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: { trainingConnection: toFirestoreValue(key), trainingSeed: toFirestoreValue(snapshot) } }), cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (response.status === 409 || response.status === 400 || response.status === 412) throw new TrainingError("Your account changed during setup. Please retry the import.", 409);
  if (!response.ok) throw new TrainingError("The private plan could not be saved. Please try again.", 503);
  return { keyId: key.keyId, publicKey: key.publicKey };
}
export async function getTrainingConnection(owner: Owner) {
  const { fields } = await readProfile(owner);
  const key = getConnection(fields);
  return key ? { keyId: key.keyId, publicKey: key.publicKey } : null;
}
export async function getTrainingSnapshot(owner: Owner) {
  const { fields } = await readProfile(owner);
  const key = getConnection(fields);
  const seed = fields.trainingSeed as TrainingSnapshot | undefined;
  if (!key || !seed) return { snapshot: null, feedConnected: false, warning: null };
  validateTrainingSnapshot(seed);
  try {
    // Ciphertext only lives in the public repository. Never fetch a caller-supplied URL.
    const response = await fetch(`https://raw.githubusercontent.com/mcada004/bidroom-web/main/data/training-snapshot.enc.json?refresh=${Math.floor(Date.now() / 60000)}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Feed unavailable.");
    const body = await response.text();
    if (body.length > 1100000) throw new Error("Feed too large.");
    const decoded = decryptTraining(JSON.parse(body), key);
    if (decoded.recordVersion < seed.recordVersion || Date.parse(decoded.generatedAt) < Date.parse(seed.generatedAt)) throw new Error("Feed predates saved plan.");
    return { snapshot: decoded, feedConnected: true, warning: null };
  } catch {
    return { snapshot: seed, feedConnected: false, warning: "Showing your saved plan. The latest update feed is not available yet." };
  }
}
