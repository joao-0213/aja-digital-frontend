import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { QuestionBank } from '@/components/features/question-bank';
export default function Page() {
  return <Suspense fallback={<Skeleton />}>
    <QuestionBank />
  </Suspense>;
}
