import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { ClassesPage } from '@/features/classes';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <ClassesPage />
  </Suspense>;
}
