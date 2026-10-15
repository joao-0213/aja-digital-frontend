import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { SubjectDetails } from '@/components/features/academic';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <SubjectDetails />
  </Suspense>;
}
