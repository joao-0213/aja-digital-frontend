import type { Metadata } from 'next';
import { AuthPage } from '@/features/auth';

export const metadata: Metadata = { title: 'Criar conta' };

export default function Page() {
  return <AuthPage mode="register" />;
}
