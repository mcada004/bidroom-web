import { getBearerToken, getFirebaseServerConfig } from '@/src/server/firebaseApiAuth';
export { isSaturdayNinePacific } from '@/src/lib/survivor/schedule';

export async function isSurvivorOrganizer(header: string | null) {
  const idToken = getBearerToken(header);
  if (!idToken) return false;
  const { firebaseApiKey } = getFirebaseServerConfig();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), cache: 'no-store',
  });
  if (!response.ok) return false;
  const data = await response.json() as { users?: { email?: string }[] };
  return data.users?.[0]?.email?.toLowerCase() === 'mcada004@gmail.com';
}
