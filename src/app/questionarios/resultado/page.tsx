import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AssessmentResult } from '@/features/assessments';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <AssessmentResult />
  </Suspense>;
}
