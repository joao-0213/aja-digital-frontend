import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { ClassesPage } from '@/components/features/academic';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <ClassesPage />
  </Suspense>;
}
