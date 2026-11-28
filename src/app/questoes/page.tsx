import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { QuestionBank } from '@/features/questions';

export const metadata: Metadata = { title: 'Banco de questões' };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <QuestionBank />
    </Suspense>
  );
}
