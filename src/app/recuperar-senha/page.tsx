import type { Metadata } from 'next';
import { AuthPage } from '@/features/auth';

export const metadata: Metadata = { title: 'Recuperar senha' };

export default function Page() {
  return <AuthPage mode="recover" />;
}
