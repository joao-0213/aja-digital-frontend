import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AssessmentBuilder } from '@/components/features/assessments';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <AssessmentBuilder />
  </Suspense>;
}
