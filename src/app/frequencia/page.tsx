import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AttendancePage } from '@/components/features/management';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <AttendancePage />
  </Suspense>;
}
