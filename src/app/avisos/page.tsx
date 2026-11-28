import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AnnouncementsPage } from '@/features/announcements';

export const metadata: Metadata = { title: 'Avisos' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AnnouncementsPage />
    </Suspense>
  );
}
