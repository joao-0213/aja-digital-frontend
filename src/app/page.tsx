import type { Metadata } from 'next';
import { Dashboard } from '@/features/dashboard';

export const metadata: Metadata = {
  title: { absolute: 'Painel · AJA Digital' }
};

export default function Page() {
  return <Dashboard />;
}
