import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { ClassesPage } from '@/features/classes';

export const metadata: Metadata = { title: 'Turmas' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ClassesPage />
    </Suspense>
  );
}
