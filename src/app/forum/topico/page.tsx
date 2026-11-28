import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { ForumThread } from '@/features/forum';

export const metadata: Metadata = { title: 'Conversa do fórum' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ForumThread />
    </Suspense>
  );
}
