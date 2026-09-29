import type { Metadata } from 'next';
import SurvivorDraft from './survivor-draft';
import './survivor.css';
export const metadata: Metadata = {
  title: 'Survivor 51 Draft | Bidroom',
  description: 'Five teams. Twenty castaways. Join the live four-round Survivor 51 snake draft.',
  openGraph: { title: 'Survivor 51 Draft | Bidroom', description: 'Join the live Survivor 51 fantasy draft.', url: 'https://bidroom.live/survivor' },
};
export default function SurvivorPage() { return <SurvivorDraft />; }
