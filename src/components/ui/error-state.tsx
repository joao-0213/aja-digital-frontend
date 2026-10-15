'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from './button';
import { Empty } from './empty';

export function ErrorState({
  message,
  retry
}: {
  message: string;
  retry: () => void;
}) {
  return <Empty title="Não conseguimos carregar esta página" description={message} action={<Button onClick={retry}><RefreshCw className="size-4" />Tentar novamente</Button>} />;
}
