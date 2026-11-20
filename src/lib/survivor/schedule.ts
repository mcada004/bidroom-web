// At 09:00 Pacific, Sunday is also Sunday in UTC. Resolve the offset on
// the target Sunday itself (not today's offset around DST transitions).
const pacificHour = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', hour: '2-digit', hourCycle: 'h23',
});
const day = 86_400_000;
function cutoffOnSunday(midnightUtc: number) {
  const candidate = new Date(midnightUtc + 16 * 3_600_000);
  return pacificHour.format(candidate) === '09' ? candidate : new Date(midnightUtc + 17 * 3_600_000);
}

export function lastSundayRelease(now: Date): Date {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay());
  const sunday = cutoffOnSunday(midnight);
  return now >= sunday ? sunday : cutoffOnSunday(midnight - 7 * day);
}

export function nextSundayRelease(now: Date): Date {
  const last = lastSundayRelease(now);
  return cutoffOnSunday(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() + 7));
}

export function isSundayReleaseHour(now: Date) {
  return now.getTime() - lastSundayRelease(now).getTime() < 3_600_000;
}
