import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AssessmentsPage } from '@/features/assessments';

export const metadata: Metadata = { title: 'Atividades' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AssessmentsPage />
    </Suspense>
  );
}
