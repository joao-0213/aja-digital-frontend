import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { StudentDetails } from '@/features/students';

export const metadata: Metadata = { title: 'Perfil do aluno' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <StudentDetails />
    </Suspense>
  );
}
