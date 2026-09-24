import { createHash, createCipheriv, createDecipheriv, constants, generateKeyPairSync, publicEncrypt, privateDecrypt, randomBytes } from "node:crypto";
import { validateTrainingSnapshot, type TrainingSnapshot } from "../lib/training.ts";

export type TrainingKey = { keyId: string; publicKey: string; privateKey: string };
export type EncryptedTraining = { format: "bidroom-training-v1"; keyId: string; wrappedKey: string; iv: string; tag: string; ciphertext: string };
export function createTrainingKey(): TrainingKey {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  return { keyId: createHash("sha256").update(publicKey).digest("hex"), publicKey, privateKey };
}
export function encryptTraining(snapshot: TrainingSnapshot, key: Pick<TrainingKey, "keyId" | "publicKey">): EncryptedTraining {
  validateTrainingSnapshot(snapshot);
  if (createHash("sha256").update(key.publicKey).digest("hex") !== key.keyId) throw new Error("Public key fingerprint mismatch.");
  const aes = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aes, iv);
  cipher.setAAD(Buffer.from(`bidroom-training-v1:${key.keyId}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(snapshot), "utf8"), cipher.final()]);
  return { format: "bidroom-training-v1", keyId: key.keyId, wrappedKey: publicEncrypt({ key: key.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, aes).toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}
export function decryptTraining(value: unknown, key: TrainingKey): TrainingSnapshot {
  const e = value as EncryptedTraining;
  if (!e || e.format !== "bidroom-training-v1" || e.keyId !== key.keyId || ![e.wrappedKey, e.iv, e.tag, e.ciphertext].every((v) => typeof v === "string") || e.ciphertext.length > 1000000) throw new Error("Training feed does not match this account connection.");
  const aes = privateDecrypt({ key: key.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(e.wrappedKey, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", aes, Buffer.from(e.iv, "base64"));
  decipher.setAAD(Buffer.from(`bidroom-training-v1:${key.keyId}`));
  decipher.setAuthTag(Buffer.from(e.tag, "base64"));
  const snapshot: unknown = JSON.parse(Buffer.concat([decipher.update(Buffer.from(e.ciphertext, "base64")), decipher.final()]).toString("utf8"));
  validateTrainingSnapshot(snapshot);
  return snapshot;
}
