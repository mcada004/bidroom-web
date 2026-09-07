export const FANTASY_ROOM_ID = "brian-2026-live";
export const FANTASY_ADMIN_EMAIL = "mcada004@gmail.com";
export type RoomMember = { uid: string; displayName: string; status: "active" | "banned"; lastSeenAt: number };
export type RoomPick = { id: string; actorUid: string | null; actorName: string; status: "D" | "X" };
export type RoomTeam = { key: string; uid: string | null; name: string; status: "active" | "banned" | "legacy"; lastSeenAt: number; picks: RoomPick[]; isAdmin: boolean };

export function buildRoomTeams(members: RoomMember[], picks: RoomPick[], adminUid: string): RoomTeam[] {
  const teams = new Map<string, RoomTeam>();
  for (const member of members) teams.set(member.uid, { ...member, key: member.uid, name: member.displayName, picks: [], isAdmin: member.uid === adminUid });
  for (const pick of picks) {
    const isAdminPick = pick.status === "D";
    const unassigned = pick.status === "X" && (!pick.actorUid || pick.actorUid === adminUid);
    const key = isAdminPick ? adminUid : unassigned ? "unassigned" : pick.actorUid!;
    if (!teams.has(key)) teams.set(key, { key, uid: unassigned ? null : key, name: isAdminPick ? "Brian" : unassigned ? "Other teams · unassigned picks" : pick.actorName, status: "legacy", lastSeenAt: 0, picks: [], isAdmin: isAdminPick });
    teams.get(key)!.picks.push(pick);
  }
  return [...teams.values()].sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

export function pickBelongsToTeam(pick: RoomPick, teamKey: string, adminUid: string) {
  if (teamKey === adminUid) return pick.status === "D";
  if (teamKey === "unassigned") return pick.status === "X" && (!pick.actorUid || pick.actorUid === adminUid);
  return pick.status === "X" && pick.actorUid === teamKey;
}
export function isRecentlyActive(lastSeenAt: number, now: number) {
  return lastSeenAt > 0 && now - lastSeenAt < 120_000;
}
