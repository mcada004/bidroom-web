import type { Metadata } from 'next';
import SurvivorSummary from './summary';
import '../survivor.css';
export const metadata: Metadata = {
  title: 'Survivor 51 Draft Summary | Bidroom',
  description: 'Live Survivor 51 teams, drafted castaways and remaining contestants.',
};
export default function SummaryPage() { return <SurvivorSummary />; }
