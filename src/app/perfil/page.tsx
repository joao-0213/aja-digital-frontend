import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { ProfilePage } from '@/components/features/profile';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <ProfilePage />
  </Suspense>;
}
