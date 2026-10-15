import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { ForumPage } from '@/components/features/forum';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <ForumPage />
  </Suspense>;
}
