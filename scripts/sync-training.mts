// Run with Node 22.18+ or Node 24. Plaintext inputs must stay outside this public repository.
import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { encryptTraining } from "../src/server/trainingCrypto.ts";
import { validateTrainingSnapshot } from "../src/lib/training.ts";

const args = process.argv.slice(2);
function argument(name: string) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
const recordPath = argument("--record");
const snapshotPath = argument("--snapshot");
const publicKeyPath = argument("--public-key") ?? "data/training-public-key.json";
const out = argument("--out") ?? "data/training-snapshot.enc.json";
if ((!recordPath && !snapshotPath) || (recordPath && snapshotPath)) throw new Error("Use --record /absolute/current-record.md OR --snapshot /absolute/snapshot.json; optional --public-key and --out.");
const input = resolve(recordPath ?? snapshotPath!);
const fromRepo = relative(process.cwd(), input);
if (!fromRepo.startsWith("..") && !fromRepo.startsWith("/")) throw new Error("Keep the plaintext plan outside the public repository.");
const contents = await readFile(input, "utf8");
let snapshot: unknown;
if (recordPath) {
  const start = contents.indexOf("<!-- TRAINING_DASHBOARD_DATA_START -->");
  const end = contents.indexOf("<!-- TRAINING_DASHBOARD_DATA_END -->", start);
  if (start < 0 || end < 0) throw new Error("Current dashboard data block is missing from the authoritative record.");
  const block = contents.slice(start, end).match(/```json\s*([\s\S]*?)```/);
  if (!block) throw new Error("Current dashboard data must be a JSON code block.");
  snapshot = JSON.parse(block[1]);
} else snapshot = JSON.parse(contents);
validateTrainingSnapshot(snapshot);
const key = JSON.parse(await readFile(publicKeyPath, "utf8"));
if (!key.publicKey || !key.keyId || key.privateKey) throw new Error("Use only the connected account's PUBLIC key file.");
await writeFile(out, JSON.stringify(encryptTraining(snapshot, key), null, 2) + "\n");
console.log(JSON.stringify({ ok: true, encryptedFile: out, recordVersion: snapshot.recordVersion, generatedAt: snapshot.generatedAt, days: snapshot.days.length }));
