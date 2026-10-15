import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { StudentDetails } from '@/components/features/management';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <StudentDetails />
  </Suspense>;
}
