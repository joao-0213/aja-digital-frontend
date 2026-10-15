import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { ForumPage } from '@/features/forum';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <ForumPage />
  </Suspense>;
}
