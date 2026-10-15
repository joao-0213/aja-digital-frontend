import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { UsersPage } from '@/features/users';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <UsersPage />
  </Suspense>;
}
