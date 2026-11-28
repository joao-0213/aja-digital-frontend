import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { MaterialReader } from '@/features/materials';

export const metadata: Metadata = { title: 'Materiais' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <MaterialReader />
    </Suspense>
  );
}
