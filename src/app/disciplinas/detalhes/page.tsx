import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { SubjectDetails } from '@/features/subjects';

export const metadata: Metadata = { title: 'Detalhes da disciplina' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <SubjectDetails />
    </Suspense>
  );
}
