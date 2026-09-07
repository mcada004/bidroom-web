import assert from "node:assert/strict";
import test from "node:test";
import { buildRoomTeams, isRecentlyActive, pickBelongsToTeam } from "./fantasyRoom.ts";

test("same-name participants keep distinct rosters, including members with no picks", () => {
  const teams = buildRoomTeams([
    { uid: "a", displayName: "Alex", status: "active", lastSeenAt: 10 },
    { uid: "b", displayName: "Alex", status: "active", lastSeenAt: 20 },
  ], [{ id: "1", actorUid: "a", actorName: "Alex", status: "X" }], "admin");
  assert.equal(teams.find(t => t.uid === "a")?.picks.length, 1);
  assert.equal(teams.find(t => t.uid === "b")?.picks.length, 0);
});
test("admin-entered other picks and legacy guests never become Brian's roster", () => {
  const picks = [
    { id: "1", actorUid: "admin", actorName: "Brian", status: "D" as const },
    { id: "2", actorUid: "admin", actorName: "Other team", status: "X" as const },
    { id: "3", actorUid: "guest", actorName: "Alex", status: "X" as const },
    { id: "4", actorUid: null, actorName: "Other", status: "X" as const },
  ];
  const teams = buildRoomTeams([], picks, "admin");
  assert.deepEqual(teams.find(t => t.key === "admin")?.picks.map(p => p.id), ["1"]);
  assert.deepEqual(teams.find(t => t.key === "unassigned")?.picks.map(p => p.id), ["2", "4"]);
  for (const team of teams) assert.deepEqual(picks.filter(p => pickBelongsToTeam(p, team.key, "admin")), team.picks);
});
test("removed team keeps picks and activity expires after two minutes", () => {
  const teams = buildRoomTeams([{ uid: "a", displayName: "Alex", status: "banned", lastSeenAt: 50 }], [{ id: "1", actorUid: "a", actorName: "Alex", status: "X" }], "admin");
  assert.equal(teams[0].status, "banned");
  assert.equal(teams[0].picks.length, 1);
  assert.equal(isRecentlyActive(0, 100), false);
  assert.equal(isRecentlyActive(1000, 120999), true);
  assert.equal(isRecentlyActive(1000, 121000), false);
});
