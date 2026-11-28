import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { SubjectsPage } from '@/features/subjects';

export const metadata: Metadata = { title: 'Disciplinas' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <SubjectsPage />
    </Suspense>
  );
}
