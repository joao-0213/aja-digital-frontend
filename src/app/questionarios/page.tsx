import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AssessmentsPage } from '@/features/assessments';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <AssessmentsPage />
  </Suspense>;
}
