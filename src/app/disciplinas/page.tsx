import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { SubjectsPage } from '@/components/features/academic';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <SubjectsPage />
  </Suspense>;
}
