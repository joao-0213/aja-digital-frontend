'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Trash2
} from 'lucide-react';
import { Button, Dialog } from '@/components/ui';
import { toErrorMessage } from '@/lib/errors';
import { HttpError } from '@/lib/http-client';
import { useSession } from '@/providers/app-context';
import type { SubmissionAttachment } from '../api';
import { useAssessmentsApi } from '../hooks/use-assessments';

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
  const api = useAssessmentsApi();
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

  if (!items.length) return null;

  return (
    <>
      <ul className="space-y-2.5">
        {items.map((item) => {
          const mime =
            item.kind === 'file'
              ? (files?.[item.fileId]?.type ??
                (remotePreviewTypes[item.fileId]?.sessionKey === sessionKey &&
                status === 'authenticated'
                  ? remotePreviewTypes[item.fileId].mime
                  : ''))
              : '';
          const canPreview = item.kind === 'file' && SAFE_PREVIEW.test(mime);
          const ItemIcon =
            item.kind === 'link'
              ? Link2
              : mime.startsWith('image/')
                ? ImageIcon
                : mime === 'application/pdf'
                  ? FileText
                  : Paperclip;

          return (
            <li
              key={item.kind === 'file' ? item.fileId : item.url}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm transition-colors hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <ItemIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold text-slate-900">{item.name}</p>
                  {item.kind === 'link' ? (
                    <a
                      className="mt-0.5 inline-flex max-w-full items-center gap-1 break-all text-xs font-medium text-brand-700 underline underline-offset-4 hover:text-brand-900"
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>{item.url}</span>
                      <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                    </a>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {canPreview
                        ? 'Visualização disponível no navegador ou por download.'
                        : 'Formato aceito; consulta por download.'}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {item.kind === 'file' && (
                  <>
                    {canPreview && (
                      <Button
                        variant="secondary"
                        aria-label={`Prévia de ${item.name}`}
                        onClick={() => void open(item, true)}
                      >
                        <Eye aria-hidden="true" className="size-4" />
                        Prévia
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      aria-label={`Baixar ${item.name}`}
                      onClick={() => void open(item, false)}
                    >
                      <Download aria-hidden="true" className="size-4" />
                      Baixar
                    </Button>
                  </>
                )}
                {onRemove && (
                  <Button
                    variant="ghost"
                    aria-label={`Remover ${item.name}`}
                    onClick={() => onRemove(item.kind === 'file' ? item.fileId : item.url)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Remover
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
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
            <img
              src={preview.url}
              alt={preview.name}
              className="mx-auto max-h-[60vh] max-w-full rounded-lg"
            />
          ) : (
            <iframe
              title={preview.name}
              src={preview.url}
              sandbox=""
              className="h-[60vh] w-full rounded-lg border border-slate-200"
            />
          ))}
        <p className="mt-4 text-sm text-slate-500">Se a prévia não abrir, feche e use Baixar.</p>
      </Dialog>
    </>
  );
}
