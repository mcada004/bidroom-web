import type { Metadata } from 'next';
import SurvivorDraft from './survivor-draft';
import './survivor.css';
export const metadata: Metadata = {
  title: 'Survivor 51 Draft | Bidroom',
  description: 'Set 1–5 teams and draft 20 castaways in a live Survivor 51 snake draft.',
  openGraph: { title: 'Survivor 51 Draft | Bidroom', description: 'Join the live Survivor 51 fantasy draft.', url: 'https://bidroom.live/survivor' },
};
export default function SurvivorPage() { return <SurvivorDraft />; }
