'use client';

import { InlineAlert } from '@/components/ui';
import { useAuthenticatedImage } from '@/hooks/use-authenticated-image';
import { cn } from '@/lib/utils';

export function AuthenticatedImage({
  image,
  className = 'my-4 max-h-80 max-w-full'
}: {
  image?: { src: string; alt: string } | null;
  className?: string;
}) {
  const { fileId, source, loading, error, retry } = useAuthenticatedImage(image?.src);

  if (!image) return null;

  if (error) {
    return (
      <InlineAlert tone="warning" className="my-4">
        <p>{error}</p>
        {fileId && (
          <button
            type="button"
            className="mt-2 min-h-11 font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
            onClick={retry}
          >
            Tentar carregar imagem novamente
          </button>
        )}
      </InlineAlert>
    );
  }

  if (!source) {
    return loading ? (
      <p role="status" className="my-4 text-sm text-slate-500">
        Carregando imagem…
      </p>
    ) : null;
  }

  return <img src={source} alt={image.alt} className={cn(className)} />;
}
