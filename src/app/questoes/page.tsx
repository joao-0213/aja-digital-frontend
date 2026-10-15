import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { QuestionBank } from '@/features/questions';

export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <QuestionBank />
  </Suspense>;
}
