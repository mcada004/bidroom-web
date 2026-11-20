'use client';
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { SCORE_ROOM, advanceResults, type SeasonResults } from '@/src/lib/survivor/scoring';
import { lastSundayRelease, nextSundayRelease } from '@/src/lib/survivor/schedule';
import verified from '@/src/lib/survivor/verified-results.json';

// The same validated feed drives both views. A slow or older response from
// either source must never roll back an elimination, bonus or check time.
export function useSurvivorResults() {
  const [scores, setScores] = useState<SeasonResults>(verified);
  const [refreshFailed, setRefreshFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let loadedCutoff = '';
    let timer: number;
    function schedule(delay: number) {
      clearTimeout(timer);
      timer = window.setTimeout(refresh, delay);
    }
    const accept = (next: SeasonResults) => setScores(prior => advanceResults(prior, next));
    const unsubscribe = onSnapshot(doc(db, 'survivorScores', SCORE_ROOM), snapshot => {
      if (snapshot.exists()) accept(snapshot.data() as SeasonResults);
    }, () => { /* The public feed is independent of the optional saved copy. */ });
    async function refresh() {
      if (pending || document.hidden) return;
      const now = new Date();
      const cutoff = lastSundayRelease(now).toISOString();
      const untilSunday = Math.max(1000, nextSundayRelease(now).getTime() - now.getTime() + 1000);
      if (loadedCutoff === cutoff) { schedule(untilSunday); return; }
      pending = true;
      try {
        const response = await fetch('/api/survivor/scoring/latest', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Season source unavailable');
        const next = await response.json();
        if (!controller.signal.aborted) {
          accept(next);
          loadedCutoff = cutoff;
          schedule(untilSunday);
          setRefreshFailed(false); // A released edition is intentionally unchanged all week.
        }
      } catch {
        if (!controller.signal.aborted) {
          setRefreshFailed(true);
          schedule(5 * 60_000); // Retry a failed read of the same published edition.
        }
      } finally { pending = false; }
    }
    void refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => {
      unsubscribe(); controller.abort(); clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return { scores, refreshFailed };
}
