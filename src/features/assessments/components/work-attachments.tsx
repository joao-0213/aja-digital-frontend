'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Dialog } from '@/components/ui';
import { HttpError } from '@/lib/http-client';
import { useSession } from '@/providers/app-context';
import { createAssessmentsApi, type SubmissionAttachment } from '../api';
import { toErrorMessage } from '@/lib/errors';

const SAFE_PREVIEW = /^(application\/pdf|image\/(png|jpeg|webp))$/;

export function WorkAttachments({
  items,
  files,
  onRemove
}: {
  items: SubmissionAttachment[];
  files?: Record<string, File>;
  onRemove?: (id: string) => void;
}) {
  const { client, sessionKey, status } = useSession();
  const api = useMemo(() => createAssessmentsApi(client), [client]);
  const [preview, setPreview] = useState<{ url: string; name: string; image: boolean }>();
  const [error, setError] = useState('');
  const [remotePreviewTypes, setRemotePreviewTypes] = useState<
    Record<string, { sessionKey: string; mime: string }>
  >({});
  const remoteFileIds = items
    .filter(
      (item): item is Extract<SubmissionAttachment, { kind: 'file' }> =>
        item.kind === 'file' && !files?.[item.fileId]
    )
    .map((item) => item.fileId)
    .join('\u001f');
  const sessionCurrent = useCallback(() => {
    const snapshot = client.getSnapshot();
    return (
      status === 'authenticated' &&
      snapshot.status === 'authenticated' &&
      snapshot.sessionKey === sessionKey
    );
  }, [client, sessionKey, status]);
  useEffect(() => {
    let active = true;
    if (status !== 'authenticated') {
      setRemotePreviewTypes({});
      return () => {
        active = false;
      };
    }
    const ids = remoteFileIds.split('\u001f').filter(Boolean);
    setRemotePreviewTypes((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([id, value]) => ids.includes(id) && value.sessionKey === sessionKey
        )
      )
    );
    void Promise.all(
      ids.map(async (id) => {
        try {
          const metadata = await api.readWorkFile(id, sessionKey);
          if (!active || !sessionCurrent()) return null;
          return [id, { sessionKey, mime: metadata.mime }] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (!active || !sessionCurrent()) return;
      setRemotePreviewTypes((current) => ({
        ...current,
        ...Object.fromEntries(
          entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        )
      }));
    });
    return () => {
      active = false;
    };
  }, [api, remoteFileIds, sessionCurrent, sessionKey, status]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview]
  );

  const open = async (item: Extract<SubmissionAttachment, { kind: 'file' }>, inline: boolean) => {
    setError('');
    try {
      if (!sessionCurrent()) return;
      const local = files?.[item.fileId];
      const metadata = local ? undefined : await api.readWorkFile(item.fileId, sessionKey);
      if (!sessionCurrent()) return;
      const mime = local?.type ?? metadata?.mime ?? 'application/octet-stream';
      const safeInline = inline && SAFE_PREVIEW.test(mime);
      const blob = local ?? (await api.readWorkFileContent(item.fileId, safeInline, sessionKey));
      if (!sessionCurrent()) return;
      if (safeInline && !SAFE_PREVIEW.test(blob.type))
        throw new Error('Este arquivo não tem bytes disponíveis para prévia.');
      const objectUrl = URL.createObjectURL(
        local ?? new Blob([blob], { type: safeInline ? blob.type : 'application/octet-stream' })
      );
      if (!safeInline) {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = item.name;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else setPreview({ url: objectUrl, name: item.name, image: mime.startsWith('image/') });
    } catch (cause: unknown) {
      if (sessionCurrent())
        setError(
          cause instanceof HttpError && cause.kind === 'not-found'
            ? 'Arquivo indisponível nesta sessão. O registro do anexo permanece preservado.'
            : toErrorMessage(cause, 'Não foi possível abrir o anexo.')
        );
    }
  };

  return (
    <>
      <ul className="divide-y divide-slate-200">
        {items.map((item) => (
          <li
            key={item.kind === 'file' ? item.fileId : item.url}
            className="space-y-2 py-4 text-sm"
          >
            <p className="break-words font-semibold">{item.name}</p>
            {item.kind === 'link' ? (
              <a
                className="inline-flex min-h-11 max-w-full items-center break-all font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.url}
              </a>
            ) : (
              <div className="flex flex-wrap gap-2">
                {SAFE_PREVIEW.test(
                  files?.[item.fileId]?.type ??
                    (remotePreviewTypes[item.fileId]?.sessionKey === sessionKey &&
                    status === 'authenticated'
                      ? remotePreviewTypes[item.fileId].mime
                      : '')
                ) ? (
                  <Button
                    variant="secondary"
                    aria-label={`Prévia de ${item.name}`}
                    onClick={() => void open(item, true)}
                  >
                    Prévia
                  </Button>
                ) : (
                  <span className="self-center text-xs text-slate-500">
                    Formato aceito; consulta por download.
                  </span>
                )}
                <Button
                  variant="secondary"
                  aria-label={`Baixar ${item.name}`}
                  onClick={() => void open(item, false)}
                >
                  Baixar
                </Button>
              </div>
            )}
            {onRemove && (
              <Button
                variant="ghost"
                aria-label={`Remover ${item.name}`}
                onClick={() => onRemove(item.kind === 'file' ? item.fileId : item.url)}
              >
                Remover
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      <Dialog
        open={!!preview}
        onClose={() => setPreview(undefined)}
        title={preview?.name ?? 'Prévia'}
      >
        {preview &&
          (preview.image ? (
            <img src={preview.url} alt={preview.name} className="max-h-[60vh] max-w-full" />
          ) : (
            <iframe title={preview.name} src={preview.url} sandbox="" className="h-[60vh] w-full" />
          ))}
        <p className="mt-4 text-sm text-slate-500">Se a prévia não abrir, feche e use Baixar.</p>
      </Dialog>
    </>
  );
}
