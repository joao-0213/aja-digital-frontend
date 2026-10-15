import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { MaterialReader } from '@/features/materials';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <MaterialReader />
  </Suspense>;
}
