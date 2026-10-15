import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { StudentsPage } from '@/components/features/management';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <StudentsPage />
  </Suspense>;
}
