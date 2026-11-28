import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AnswerAssessment } from '@/features/assessments';

export const metadata: Metadata = { title: 'Responder atividade' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AnswerAssessment />
    </Suspense>
  );
}
