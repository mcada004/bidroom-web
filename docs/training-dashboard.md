# Private training dashboard

`/training` uses the existing Firebase login. Both APIs verify the bearer token with Firebase and restrict access to the existing owner identity. Anonymous users and other accounts receive no training data. The owner-only navigation link is convenience, not authorization.

## Storage and updates

The owner's private `users/{uid}` Firestore document holds `trainingConnection` (RSA private/public key and fingerprint) and `trainingSeed` (last directly imported snapshot). Existing self-only Firestore rules apply; no service account, new Firebase rules, or account permissions are needed. Setup uses field masks and a document-update precondition to preserve unrelated profile fields and reject concurrent changes.

`data/training-snapshot.enc.json` contains only AES-256-GCM ciphertext, with its random key wrapped by RSA-OAEP-SHA256. `data/training-public-key.json` contains only the public encryption key. Never commit a plaintext plan, private key, Firebase ID token, or source training record to this PUBLIC repository.

The authenticated server reads and decrypts the latest encrypted feed from the fixed GitHub origin. Responses use `private, no-store`. The client checks on opening, returning to the tab, and every minute while visible. It keeps the most recent successful in-memory snapshot if an update fails. Last plan update, reviewed-data coverage, overdue updates and provisional dates are explicit. No date passing marks a workout complete.

## Initial connection

1. Sign into the existing owner account and open `/training/setup`.
2. Import the prepared snapshot JSON through the page's file control. Plaintext goes only to the authenticated private-account endpoint.
3. Expand Update connection details. Save the displayed PUBLIC key JSON to `data/training-public-key.json`.
4. Encrypt the same snapshot using the script below. Commit only the public key and ciphertext using the connected GitHub app.
5. Verify `/training` displays the intended snapshot and Connected updates before reporting success.

## Coaching publication workflow

The current living training record is the authority. Read its latest version before each update. Its `TRAINING_DASHBOARD_DATA_START/END` JSON block is the dashboard projection, and must be reconciled with newer dated instructions whenever any workout, fueling target, completion, or rationale changes. The daily automation must review the record, not merely advance the timestamp. Do not replace confirmed sessions with a generic regenerated plan. Include 14 upcoming dated days and the preserved complete build; clearly mark later targets provisional.

Keep plaintext input outside the checkout. Run Node 22.18+ or 24:

```
node scripts/sync-training.mts --record /absolute/path/to/current-record.md
```

Alternatively use `--snapshot /absolute/path/to/snapshot.json` for the initial import. Validation rejects invalid dates, duplicated dates, malformed workouts and incompatible macro energy. Use the connected GitHub app to update only `data/training-snapshot.enc.json` on the current default branch with its current SHA; reconcile conflicts rather than force pushing. Fetch the committed ciphertext and compare it with the local output before reporting a successful sync.

Daily schedule: 09:00 America/Los_Angeles, respecting daylight saving time. A daily ChatGPT automation performs the review/publication. This repository alone cannot observe changes in ChatGPT Library. Coaching and fueling workflows must publish after saving a revised plan; the scheduled review also reconciles changes. Never call that event-driven Library monitoring. If a publish fails, keep the latest good feed and explicitly report the unsynced change.
