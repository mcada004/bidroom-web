import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { FANTASY_ROOM_ID } from "@/src/lib/fantasyRoom";

/** Only an explicit Draft action may create a pick; browser caches never write picks. */
export async function createFantasyRoomPick(playerId: number, status: "D" | "X") {
  const user = auth.currentUser;
  if (!user) throw new Error("Join the room with your username before drafting.");
  await runTransaction(db, async transaction => {
    const memberRef = doc(db, "fantasyDrafts", FANTASY_ROOM_ID, "members", user.uid);
    const pickRef = doc(db, "fantasyDrafts", FANTASY_ROOM_ID, "picks", String(playerId));
    const [member, pick] = await Promise.all([transaction.get(memberRef), transaction.get(pickRef)]);
    const data = member.data();
    if (data?.status !== "active" || typeof data.displayName !== "string" || data.displayName.trim().length < 2) throw new Error("Join the room with your username before drafting.");
    if (pick.exists()) throw new Error("That player was already drafted. Refresh the board to see the latest picks.");
    transaction.set(pickRef, { status, actorName: data.displayName, actorUid: user.uid, origin: "named-room-v1", updatedAt: serverTimestamp() });
  });
}
