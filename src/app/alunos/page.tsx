import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { StudentsPage } from '@/features/students';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <StudentsPage />
  </Suspense>;
}
