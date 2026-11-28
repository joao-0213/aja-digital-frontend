import { cn } from '@/lib/utils';
import { Button } from './button';

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className
}: {
  page: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label="Paginação"
      className={cn('mt-6 flex flex-wrap items-center justify-between gap-3', className)}
    >
      <Button
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        Anterior
      </Button>
      <span className="text-sm text-slate-600">
        Página {page} de {totalPages}
      </span>
      <Button
        variant="secondary"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Próxima
      </Button>
    </nav>
  );
}
