import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { CalendarPage } from '@/components/features/calendar';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <CalendarPage />
  </Suspense>;
}
