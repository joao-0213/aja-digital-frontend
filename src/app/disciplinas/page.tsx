import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { SubjectsPage } from '@/features/subjects';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <SubjectsPage />
  </Suspense>;
}
