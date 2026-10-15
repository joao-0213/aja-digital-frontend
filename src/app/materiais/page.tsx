import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { MaterialReader } from '@/components/features/material-reader';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <MaterialReader />
  </Suspense>;
}
