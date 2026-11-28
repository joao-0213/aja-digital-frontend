import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { ProfilePage } from '@/features/profile';

export const metadata: Metadata = { title: 'Meu perfil' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ProfilePage />
    </Suspense>
  );
}
