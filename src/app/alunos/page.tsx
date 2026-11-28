import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { StudentsPage } from '@/features/students';

export const metadata: Metadata = { title: 'Alunos' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <StudentsPage />
    </Suspense>
  );
}
