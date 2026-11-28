import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { UsersPage } from '@/features/users';

export const metadata: Metadata = { title: 'Usuários' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <UsersPage />
    </Suspense>
  );
}
