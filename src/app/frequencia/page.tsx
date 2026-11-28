import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AttendancePage } from '@/features/attendance';

export const metadata: Metadata = { title: 'Frequência' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AttendancePage />
    </Suspense>
  );
}
