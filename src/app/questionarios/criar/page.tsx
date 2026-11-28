import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AssessmentBuilder } from '@/features/assessments';

export const metadata: Metadata = { title: 'Criar atividade' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AssessmentBuilder />
    </Suspense>
  );
}
