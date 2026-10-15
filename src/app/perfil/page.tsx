import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { ProfilePage } from '@/features/profile';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <ProfilePage />
  </Suspense>;
}
