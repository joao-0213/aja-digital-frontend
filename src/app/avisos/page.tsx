import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AnnouncementsPage } from '@/features/announcements';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <AnnouncementsPage />
  </Suspense>;
}
