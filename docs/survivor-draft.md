# Survivor 51 draft

Public route: `/survivor`. Isolated Firestore document: `survivorDrafts/survivor-51-2026`.

The organizer can set a limit of 1–5 teams before starting. The default is four. Guests join using a name with Firebase anonymous authentication, which persists ownership in their browser. The organizer can move joined teams, then press “Go to draft” to shuffle or keep the displayed order. Starting locks in the teams currently present and uses that count, even if fewer joined than the saved limit. Thus a two-person test snakes through all 20 contestants with ten picks apiece. Three teams receive 7, 7, and 6 picks; four receive five each, five receive four each. Guests cannot join after the draft starts. Reset before the real draft; the warning explains that teams and picks are cleared. Shared state uses Firestore transactions and live snapshots.

The separate public summary at `/survivor/summary` shows each team's roster and all remaining castaways, updated from the same Firestore room. The board links to it and remains the place to join and make picks. Firestore rules enforce the count, unique names and owners, organizer-only configuration/order/start/reset, valid castaways, turn order, and append-only picks. There is no round-one video feature.

Scoring is stored separately at `survivorScores/survivor-51-2026`, read-only for the public, organizer-writeable after validated source retrieval, and available to the scheduled server service account when configured. Departures of the 20 draftable castaways (vote-outs, quits, medical evacuations, and withdrawals) receive 1, 2, ... points in the order they leave (Aaliyah was eliminated before the draft and is excluded). A juror adds 5, final tribal adds another 10, and the winner another 20. At the final, the three finalists receive base survival placements 18, 19, and 20 before bonuses. Bonuses are additive. Resetting a test draft does not erase season results.

The organizer's “Please update scoring” button and the Saturday 9 p.m. Pacific cron fetch the live `Survivor 51` contestant table on Wikipedia. The parser requires all 21 castaways, contiguous known vote-out ordinals, table-ordered departures, and monotonic results; if the source changes shape or contradicts already-scored results, it fails without changing points. The scoreboard shows the last successful check and source. Live viewing cannot update before the source publishes results. The Vercel Hobby scheduler may invoke within the 9 p.m. hour rather than at exactly 9:00. Two weekly UTC schedules cover both daylight-saving and standard time; the endpoint checks the local Pacific hour. The unattended cron requires `CRON_SECRET` and a Firestore service account in Vercel; these are not yet configured, so it currently fails closed until set up.

Cast facts and photos checked September 29, 2026 against https://parade.com/tv/survivor-51-cast-2026. Aaliyah Puglia is excluded. Photos: Robert Voets/CBS, served by Parade. This is a fixed draft snapshot, not an automatic elimination feed.

## Release prerequisite

Publish the updated `/survivorDrafts/{draftId}` rule in Firebase project `bidroom-web` before merging the website changes. Compare live rules first and preserve unrelated differences. GitHub/Vercel publication does not deploy Firestore rules.

Checks: `node --test src/lib/survivor/draft.test.mts`, `npx tsc --noEmit`, and `npm run build` with normal public Firebase configuration.

Database tests: `npx firebase-tools@14.27.0 emulators:exec --project demo-survivor --config firebase.rules-test.json --only firestore 'node scripts/test-survivor-rules.mjs && node scripts/test-fantasy-room-rules.mjs'`.

The emulator tests cover simultaneous submissions, all 20 turns, invalid/out-of-turn/duplicate picks, early start with the present teams, team caps, duplicate names, organizer-only shuffle/start/reset and rejoin, public read-only scoring access, and existing fantasy rules regression.
