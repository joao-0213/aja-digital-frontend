import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { StudentDetails } from '@/features/students';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <StudentDetails />
  </Suspense>;
}
