import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AssessmentResult } from '@/features/assessments';

export const metadata: Metadata = { title: 'Resultado da atividade' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AssessmentResult />
    </Suspense>
  );
}
