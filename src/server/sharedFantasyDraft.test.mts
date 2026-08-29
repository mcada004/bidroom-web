import assert from "node:assert/strict";
import test from "node:test";
import {
  applySharedDraftMutation,
  emptySharedDraftState,
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
