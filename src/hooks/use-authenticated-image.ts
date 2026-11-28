'use client';

import { useEffect, useMemo, useState } from 'react';
import { isCancelledError, toErrorMessage } from '@/lib/errors';
import { createFilesApi } from '@/lib/http-files';
import { useSession } from '@/providers/app-context';
import { useObjectUrl } from './use-object-url';

export function useAuthenticatedImage(src: string | undefined | null) {
  const { client, sessionKey, resourceEpoch, status } = useSession();
  const files = useMemo(() => createFilesApi(client), [client]);

  const match = src?.match(/^\/api\/v1\/files\/([^/]+)\/content$/);
  let fileId = '';
  try {
    fileId = match ? decodeURIComponent(match[1]) : '';
  } catch {
    fileId = '';
  }

  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const objectUrl = useObjectUrl(blob);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resourceEpoch and retryCount are intentional triggers to reload the authenticated image
  useEffect(() => {
    if (!src) {
      setBlob(null);
      setError('');
      return;
    }
    if (!fileId) {
      setBlob(null);
      setError('');
      return;
    }
    if (status !== 'authenticated') {
      setBlob(null);
      setError('Entre novamente para consultar esta imagem.');
      return;
    }
    const controller = new AbortController();
    let active = true;
    const isCurrent = () => {
      const session = client.getSnapshot();
      return (
        active &&
        !controller.signal.aborted &&
        session.status === 'authenticated' &&
        session.sessionKey === sessionKey
      );
    };
    setBlob(null);
    setError('');
    void files
      .download(fileId, 'inline', controller.signal)
      .then((downloaded) => {
        if (isCurrent()) setBlob(downloaded);
      })
      .catch((cause) => {
        if (isCurrent() && !isCancelledError(cause)) {
          setError(toErrorMessage(cause, 'Não foi possível carregar a imagem.'));
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, fileId, files, resourceEpoch, retryCount, sessionKey, src, status]);

  const publicSrc =
    !fileId && src && /^\/questions\/[A-Za-z0-9_-]+\.(?:svg|png|jpe?g|webp)$/.test(src) ? src : '';

  return {
    fileId,
    source: fileId ? objectUrl : publicSrc,
    loading: Boolean(fileId && !objectUrl && !error),
    error,
    retry: () => setRetryCount((value) => value + 1)
  };
}
