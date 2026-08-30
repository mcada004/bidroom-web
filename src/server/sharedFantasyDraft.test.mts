import assert from "node:assert/strict";
import test from "node:test";
import {
  applySharedDraftMutation,
  emptySharedDraftState,
  getDraftValueOpinion,
  getLastDraftedPick,
  SharedDraftError,
} from "../lib/sharedFantasyDraftState.ts";

test("shared fantasy draft adds an available player once", () => {
  const state = applySharedDraftMutation(
    emptySharedDraftState(),
    { action: "draft", rank: 1, status: "X", actorName: "Chris", actorUid: null },
    "2026-08-29T01:00:00.000Z"
  );

  assert.equal(state.picks["1"]?.actorName, "Chris");
  assert.equal(state.picks["1"]?.status, "X");
  assert.equal(state.revision, 1);
  assert.throws(
    () => applySharedDraftMutation(state, { action: "draft", rank: 1, status: "X", actorName: "Sam", actorUid: null }),
    (error) => error instanceof SharedDraftError && error.status === 409
  );
});

test("admin mutations can reclassify, undo, and reset picks", () => {
  const first = applySharedDraftMutation(
    emptySharedDraftState(),
    { action: "draft", rank: 1, status: "X", actorName: "Chris", actorUid: null }
  );
  const mine = applySharedDraftMutation(
    first,
    { action: "set", rank: 1, status: "D", actorName: "Brian", actorUid: "admin" }
  );
  assert.equal(mine.picks["1"]?.status, "D");

  const undone = applySharedDraftMutation(mine, { action: "undo", rank: 1, actorName: "Brian" });
  assert.equal(undone.picks["1"], undefined);

  const withAnotherPick = applySharedDraftMutation(
    undone,
    { action: "draft", rank: 2, status: "X", actorName: "Chris", actorUid: null }
  );
  const reset = applySharedDraftMutation(withAnotherPick, { action: "reset", actorName: "Brian" });
  assert.deepEqual(reset.picks, {});
  assert.equal(reset.lastAction?.action, "reset");
});

test("last drafted follows timestamps, not player ID, and counts both teams", () => {
  const first = applySharedDraftMutation(emptySharedDraftState(),
    { action: "draft", rank: 198, status: "D", actorName: "Brian", actorUid: "admin" },
    "2026-08-30T01:00:00.000Z");
  const second = applySharedDraftMutation(first,
    { action: "draft", rank: 2, status: "X", actorName: "Chris", actorUid: "guest" },
    "2026-08-30T01:01:00.000Z");
  assert.equal(getLastDraftedPick(second.picks)?.pick.rank, 2);
  assert.equal(getLastDraftedPick(second.picks)?.pick.actorName, "Chris");
  assert.equal(getLastDraftedPick(second.picks)?.pickNumber, 2);

  const undone = applySharedDraftMutation(second, { action: "undo", rank: 2, actorName: "Brian" });
  assert.equal(getLastDraftedPick(undone.picks)?.pick.rank, 198);
  assert.equal(getLastDraftedPick(undone.picks)?.pickNumber, 1);
  const reset = applySharedDraftMutation(undone, { action: "reset", actorName: "Brian" });
  assert.equal(getLastDraftedPick(reset.picks), null);
});

test("last drafted does not invent chronology for missing timestamps", () => {
  assert.equal(getLastDraftedPick({}), null);
  const legacy = applySharedDraftMutation(emptySharedDraftState(),
    { action: "draft", rank: 1, status: "D", actorName: "Brian", actorUid: "admin" }, "");
  assert.equal(getLastDraftedPick(legacy.picks), null);
  const fresh = applySharedDraftMutation(legacy,
    { action: "draft", rank: 27, status: "X", actorName: "Chris", actorUid: "guest" },
    "2026-08-30T01:00:00.000Z");
  assert.equal(getLastDraftedPick(fresh.picks)?.pickNumber, 2);
  assert.equal(getLastDraftedPick(fresh.picks)?.pick.rank, 27);
});

test("last drafted is stable for simultaneous updates and reflects corrections", () => {
  const first = applySharedDraftMutation(emptySharedDraftState(),
    { action: "draft", rank: 24, status: "D", actorName: "Brian", actorUid: "admin" },
    "2026-08-30T01:00:00.000Z");
  const second = applySharedDraftMutation(first,
    { action: "draft", rank: 2, status: "X", actorName: "Chris", actorUid: "guest" },
    "2026-08-30T01:00:00.000Z");
  assert.equal(getLastDraftedPick(second.picks)?.pick.rank, 2);
  const corrected = applySharedDraftMutation(second,
    { action: "set", rank: 24, status: "X", actorName: "Other team", actorUid: "admin" },
    "2026-08-30T01:02:00.000Z");
  assert.equal(getLastDraftedPick(corrected.picks)?.pick.rank, 24);
  assert.equal(getLastDraftedPick(corrected.picks)?.pickNumber, 2);
});

test("value grades use current combined rank with symmetric six/twelve-pick thresholds", () => {
  for (const [boardRank, pick, label] of [
    [1, 1, "Fair price"], [20, 15, "Fair price"], [20, 25, "Fair price"],
    [20, 14, "Slight reach"], [20, 9, "Slight reach"], [20, 8, "Reach"],
    [20, 26, "Good value"], [20, 31, "Good value"], [20, 32, "Great value"],
    [145, 48, "Reach"], [134, 144, "Good value"],
  ] as const) {
    assert.equal(getDraftValueOpinion(boardRank, pick).label, label);
  }
  assert.equal(getDraftValueOpinion(1, 1).comparison, "Exactly at our board rank.");
  assert.equal(getDraftValueOpinion(20, 19).comparison, "1 spot earlier than our board rank.");
  assert.equal(getDraftValueOpinion(20, 32).comparison, "12 spots later than our board rank.");
  assert.throws(() => getDraftValueOpinion(0, 1), RangeError);
  assert.throws(() => getDraftValueOpinion(1, Number.NaN), RangeError);
});
