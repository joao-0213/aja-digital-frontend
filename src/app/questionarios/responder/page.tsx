import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AnswerAssessment } from '@/components/features/assessments';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <AnswerAssessment />
  </Suspense>;
}
