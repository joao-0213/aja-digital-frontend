import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { ForumPage } from '@/features/forum';

export const metadata: Metadata = { title: 'Fórum' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ForumPage />
    </Suspense>
  );
}
