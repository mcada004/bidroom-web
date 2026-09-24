import test from "node:test";
import assert from "node:assert/strict";
import { createTrainingKey, encryptTraining, decryptTraining } from "./trainingCrypto.ts";
import { pacificDate, weekStart, addDays, validateTrainingSnapshot, type TrainingSnapshot } from "../lib/training.ts";

const sample: TrainingSnapshot = { schemaVersion: 1, dailyRefreshActive: false, generatedAt: "2026-09-24T18:00:00Z", recordVersion: 1, timezone: "America/Los_Angeles", dataThrough: "Example", confirmedThrough: "2026-09-27", race: { name: "Example race", date: "2027-01-17", goal: "Example goal" }, days: [{ date: "2026-09-25", status: "confirmed", focus: "Easy", workouts: [{ title: "Easy run", sport: "run", miles: 4, intensityMinutes: 0, pace: "Conversational", effort: "Easy", steps: ["Run easy"], recovery: "None" }], fueling: null }], weeks: [], paces: [], changes: [], guidance: [] };
test("encrypted feed roundtrips; another key and modified ciphertext are rejected", () => {
  const key = createTrainingKey();
  const envelope = encryptTraining(sample, key);
  assert.deepEqual(decryptTraining(envelope, key), sample);
  assert.ok(!JSON.stringify(envelope).includes("Example race"));
  assert.throws(() => decryptTraining(envelope, createTrainingKey()));
  const bytes = Buffer.from(envelope.ciphertext, "base64"); bytes[5] ^= 1;
  assert.throws(() => decryptTraining({ ...envelope, ciphertext: bytes.toString("base64") }, key));
  assert.throws(() => decryptTraining({ ...envelope, keyId: "other-account" }, key));
});
test("Pacific day rolls at local midnight through DST and year boundaries", () => {
  assert.equal(pacificDate(new Date("2026-09-25T06:59:00Z")), "2026-09-24");
  assert.equal(pacificDate(new Date("2026-09-25T07:00:00Z")), "2026-09-25");
  assert.equal(pacificDate(new Date("2026-11-02T07:59:00Z")), "2026-11-01");
  assert.equal(pacificDate(new Date("2026-11-02T08:00:00Z")), "2026-11-02");
  assert.equal(weekStart("2027-01-03"), "2026-12-28");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("invalid dates, duplicate days and inconsistent fuel totals cannot publish", () => {
  validateTrainingSnapshot(sample);
  assert.throws(() => validateTrainingSnapshot({ ...sample, days: [sample.days[0], sample.days[0]] }));
  assert.throws(() => validateTrainingSnapshot({ ...sample, confirmedThrough: "2026-02-30" }));
  assert.throws(() => validateTrainingSnapshot({ ...sample, days: [{ ...sample.days[0], fueling: { status: "confirmed", calories: 1000, carbs: 400, protein: 140, fat: 80, duringCarbs: 60, before: "Bread", during: "Fuel", after: "Breakfast", preparation: "Dinner", meals: [], notes: [] } }] }));
});
