# Survivor 51 draft

Public route: `/survivor`. Isolated Firestore document: `survivorDrafts/survivor-51-2026`.

Five teams join using a name; existing Firebase anonymous authentication persists ownership in the browser. Users must return using the same browser. Brian signs into Bidroom with his verified mcada004@gmail.com account to move joined teams up/down and start when all five have joined. This locks the order. Shared state uses Firestore transactions and live snapshots, never localStorage.

Rules enforce five unique names and owners, verified organizer-only order changes/start/reset, valid contestants, turn order, unique picks and append-only history. The public may read this room but cannot list rooms. Only the current team may append a pick. Confirmations record the expected pick number to reject stale submissions even on consecutive turns. The organizer can reset at any point after a team joins, after an explicit warning confirmation. Reset deletes the shared room record, including teams, draft order and picks; guests can then join a new draft.

Cast facts and photos checked September 29, 2026 against https://parade.com/tv/survivor-51-cast-2026. Aaliyah Puglia is excluded. Photos: Robert Voets/CBS, served by Parade. This is a fixed draft snapshot, not an automatic elimination feed.

## Release prerequisite

Publish the updated `/survivorDrafts/{draftId}` block in `firestore.rules` to Firebase project `bidroom-web` before production rollout. Compare live rules first and preserve unrelated differences. GitHub/Vercel publication does not deploy rules. Anonymous authentication is already used by the existing fantasy guest room.

Checks: `node --test src/lib/survivor/draft.test.mts`, `npx tsc --noEmit`, and `npm run build` with normal public Firebase configuration.

Database tests: `npx firebase-tools@14.27.0 emulators:exec --project demo-survivor --config firebase.rules-test.json --only firestore 'node scripts/test-survivor-rules.mjs && node scripts/test-fantasy-room-rules.mjs'`.

The emulator tests cover simultaneous submissions, all 20 turns, invalid/out-of-turn/duplicate picks, team caps, duplicate names, organizer-only reset and rejoin, public read-only access and existing fantasy rules regression.
