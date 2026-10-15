'use client';

import { ErrorState } from '@/components/ui';
export default function Error({
  reset
}: {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}) {
  return <ErrorState message="Ocorreu um problema ao mostrar este conteúdo. Suas alterações locais foram preservadas." retry={reset} />;
}
