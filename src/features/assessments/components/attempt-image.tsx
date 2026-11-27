'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/providers/app-context';
import { createFilesApi } from '@/lib/http-files';
import { isCancelledError, toErrorMessage } from '@/lib/errors';

export function AttemptImage({ image }: { image: { src: string; alt: string } }) {
  const { client, sessionKey, resourceEpoch, status } = useSession();
  const files = useMemo(() => createFilesApi(client), [client]);
  const fileId = /^\/api\/v1\/files\/([^/]+)\/content$/.exec(image.src)?.[1];
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resourceEpoch and retry are intentional triggers to reload the authenticated image
  useEffect(() => {
    if (!fileId) {
      setSource(image.src);
      setError('');
      return;
    }
    if (status !== 'authenticated') {
      setSource(null);
      setError('Entre novamente para consultar esta imagem.');
      return;
    }
    const controller = new AbortController();
    let active = true;
    let objectUrl: string | undefined;
    const current = () => {
      const session = client.getSnapshot();
      return (
        active &&
        !controller.signal.aborted &&
        session.status === 'authenticated' &&
        session.sessionKey === sessionKey
      );
    };
    setSource(null);
    setError('');
    void files
      .download(decodeURIComponent(fileId), 'inline', controller.signal)
      .then((blob) => {
        if (!current()) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch((cause) => {
        if (current() && !isCancelledError(cause))
          setError(toErrorMessage(cause, 'Não foi possível carregar a imagem.'));
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, fileId, files, image.src, resourceEpoch, retry, sessionKey, status]);

  if (error)
    return (
      <div role="status" className="my-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <p>{error}</p>
        {fileId && (
          <button
            type="button"
            className="mt-2 min-h-11 font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
            onClick={() => setRetry((value) => value + 1)}
          >
            Tentar carregar imagem novamente
          </button>
        )}
      </div>
    );
  if (!source)
    return (
      <p role="status" className="my-4 text-sm text-slate-500">
        Carregando imagem…
      </p>
    );
  return <img src={source} alt={image.alt} className="my-4 max-h-80 max-w-full" />;
}
