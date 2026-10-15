import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { ForumThread } from '@/components/features/forum';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <ForumThread />
  </Suspense>;
}
