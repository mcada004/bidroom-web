# Survivor 51 draft

Public route: `/survivor`. Isolated Firestore document: `survivorDrafts/survivor-51-2026`.

Five teams join using a name; existing Firebase anonymous authentication persists ownership in the browser. Users must return using the same browser. Brian signs into Bidroom with his verified mcada004@gmail.com account to move joined teams up/down, shuffle and start once five have joined, or start a test draft early. Starting early permits late joiners, but a pick pauses when an empty slot is on the clock. Reset before the real full-team shuffle. The explicit "Start with displayed order" option preserves manual ordering. Shared state uses Firestore transactions and live snapshots, never localStorage; new team names appear automatically.

Rules enforce five unique names and owners, verified organizer-only order changes/start/reset, valid contestants, turn order, unique picks and append-only history. The public may read this room but cannot list rooms. Only the current team may append a pick. Confirmations record the expected pick number to reject stale submissions even on consecutive turns. The organizer can reset at any point after a team joins, after an explicit warning confirmation. Reset deletes the shared room record, including teams, draft order and picks; guests can then join a new draft.

Scoring is stored separately at `survivorScores/survivor-51-2026`, read-only for the public and written by the server service account. Eliminations of the 20 draftable castaways receive 1, 2, ... points in boot order (Aaliyah was eliminated before the draft and is excluded). A juror adds 5, final tribal adds another 10, and the winner another 20. At the final, the three finalists receive base survival placements 18, 19, and 20 before bonuses. Bonuses are additive. Resetting a test draft does not erase season results.

The organizer's “Please update scoring” button and the Saturday 9 p.m. Pacific cron fetch the live `Survivor 51` contestant table on Wikipedia. The parser requires all 21 castaways, contiguous known elimination placements, and monotonic results; if the source changes shape or contradicts already-scored results, it fails without changing points. The scoreboard shows the last successful check and source. Live viewing cannot update before the source publishes results. The Vercel Hobby scheduler may invoke within the 9 p.m. hour rather than at exactly 9:00. Two weekly UTC schedules cover both daylight-saving and standard time; the endpoint checks the local Pacific hour. `CRON_SECRET` and the existing Firebase service-account environment variables must be configured.

Cast facts and photos checked September 29, 2026 against https://parade.com/tv/survivor-51-cast-2026. Aaliyah Puglia is excluded. Photos: Robert Voets/CBS, served by Parade. This is a fixed draft snapshot, not an automatic elimination feed.

## Release prerequisite

Publish the updated `/survivorDrafts/{draftId}` block in `firestore.rules` to Firebase project `bidroom-web` before production rollout. Compare live rules first and preserve unrelated differences. GitHub/Vercel publication does not deploy rules. Anonymous authentication is already used by the existing fantasy guest room.

Checks: `node --test src/lib/survivor/draft.test.mts`, `npx tsc --noEmit`, and `npm run build` with normal public Firebase configuration.

Database tests: `npx firebase-tools@14.27.0 emulators:exec --project demo-survivor --config firebase.rules-test.json --only firestore 'node scripts/test-survivor-rules.mjs && node scripts/test-fantasy-room-rules.mjs'`.

The emulator tests cover simultaneous submissions, all 20 turns, invalid/out-of-turn/duplicate picks, early start and late join, team caps, duplicate names, organizer-only shuffle/start/reset and rejoin, public read-only scoring access, and existing fantasy rules regression.
