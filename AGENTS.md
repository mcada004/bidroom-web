# Bidroom

Preserve the existing Next.js, Firebase and Vercel deployment. Changes to main deploy production. Do not change existing trip, ride, tournament or fantasy capabilities while adding another feature.

## Training data

This repository is public. The private dashboard is at `/training`; see `docs/training-dashboard.md` before editing its data or sync workflow. Never commit plaintext training or nutrition records, health measurements, private encryption keys, credentials, or Firebase ID tokens. Keep plaintext temporary inputs outside this repository. `data/training-public-key.json` is a PUBLIC key; only encrypted snapshot envelopes belong in `data/training-snapshot.enc.json`.

When a coaching workflow saves a workout or fueling revision in the authoritative living record, update its dashboard projection and publish the encrypted snapshot in the same workflow. Preserve confirmed prescriptions and clearly label provisional dates. Do not claim synchronization from a file save alone. Test date boundaries, macro arithmetic, and private authorization when changing those paths.
