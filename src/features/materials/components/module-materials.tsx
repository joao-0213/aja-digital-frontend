'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, CheckCircle2, ChevronUp, FileText, Play, Upload } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import { Button, Empty, ErrorState, Skeleton } from '@/components/ui';
import { PublicationDate } from '@/components/ui/publication-date';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useHttpQuery } from '@/hooks/use-http-query';
import { HttpError } from '@/lib/http-client';
import type { TrailModule } from '@/models';
import { createMaterialsApi, type MaterialDto } from '../api';
import { MaterialComposer } from './material-composer';
import { toErrorMessage } from '@/lib/errors';

export function ModuleMaterials({
  module,
  canEdit,
  editing,
  onChanged
}: {
  module: TrailModule;
  canEdit: boolean;
  editing: boolean;
  onChanged?: () => void;
}) {
  const { client, sessionKey, user } = useSession();
  const api = useMemo(() => createMaterialsApi(client), [client]);
  const query = useHttpQuery(
    { sessionKey, key: ['materials', 'module', module.id, module.revision ?? 1] },
    useCallback((signal) => api.all({ moduleId: module.id }, signal), [api, module.id])
  );
  const progress = useHttpQuery(
    { sessionKey, key: ['materials', 'module-progress', module.subjectId] },
    useCallback((signal) => api.allProgress(module.subjectId, signal), [api, module.subjectId])
  );
  const [composer, setComposer] = useState(
    () => client.readDraft<boolean>(`material-open:${module.id}`) ?? false
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<{ module: TrailModule; items: MaterialDto[] } | null>(null);
  const [override, setOverride] = useState<{
    source: MaterialDto[];
    module: TrailModule;
    items: MaterialDto[];
  } | null>(null);
  const items = query.data && override?.source === query.data ? override.items : (query.data ?? []);
  const parent = query.data && override?.source === query.data ? override.module : module;
  const close = () => {
    client.clearDraft(`material-open:${module.id}`, sessionKey);
    setComposer(false);
  };
  const inspect = async () => {
    try {
      const current = await api.context(module.id);
      if (client.getSnapshot().sessionKey !== sessionKey) return;
      const rows = await api.all({ moduleId: module.id });
      if (client.getSnapshot().sessionKey === sessionKey)
        setLatest({ module: current.module, items: rows });
    } catch (cause: unknown) {
      if (client.getSnapshot().sessionKey === sessionKey)
        setError(toErrorMessage(cause, 'Não foi possível consultar a ordem atual.'));
    }
  };
  const moveUp = async (index: number) => {
    if (!index || busy || conflict || client.getSnapshot().sessionKey !== sessionKey) return;
    const reordered = [...items];
    [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
    setBusy(true);
    setError('');
    try {
      await api.reorder(module.id, {
        expectedRevision: parent.revision ?? 1,
        items: reordered.map((item) => ({ id: item.id, expectedRevision: item.revision }))
      });
      if (client.getSnapshot().sessionKey !== sessionKey) return;
      onChanged?.();
      await query.invalidate();
    } catch (cause: unknown) {
      if (client.getSnapshot().sessionKey !== sessionKey) return;
      setError(toErrorMessage(cause, 'Não foi possível ordenar. O conjunto anterior foi mantido.'));
      if (cause instanceof HttpError && cause.kind === 'conflict') {
        setConflict(true);
        await inspect();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {query.loading ? (
        <Skeleton />
      ) : query.error ? (
        <ErrorState message={query.error.message} retry={() => void query.retry()} />
      ) : (
        <div className="divide-y divide-slate-100 px-4 sm:px-5">
          {items.map((item, index) => {
            const Icon = item.kind === 'pdf' ? FileText : item.kind === 'video' ? Play : BookOpen;
            const done = progress.data?.some((row) => row.materialId === item.id && row.completed);
            return (
              <div key={item.id} className="flex items-center gap-2">
                <Link
                  href={`/materiais?id=${encodeURIComponent(item.id)}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-4 hover:bg-brand-50/50"
                >
                  <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.kind === 'pdf'
                        ? 'PDF'
                        : item.kind === 'video'
                          ? 'Vídeo de apoio'
                          : 'Texto de apoio'}
                      {item.file
                        ? ` · ${(item.file.size / 1024).toFixed(0)} KB`
                        : ` · ${item.duration} min de estudo`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      <PublicationDate value={item.createdAt} />
                    </p>
                  </div>
                  {user?.role === 'student' && done && (
                    <CheckCircle2
                      aria-label="Concluído"
                      className="size-5 shrink-0 text-emerald-600"
                    />
                  )}
                </Link>
                {canEdit && editing && (
                  <Button
                    variant="ghost"
                    aria-label={`Mover ${item.title} para cima`}
                    disabled={index === 0 || busy || conflict}
                    onClick={() => void moveUp(index)}
                  >
                    <ChevronUp aria-hidden="true" className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
          {!items.length && (
            <Empty
              title="Nenhum material neste módulo"
              description="Os materiais aparecem após a publicação pela equipe docente."
            />
          )}
        </div>
      )}
      {progress.error && (
        <div className="px-5 pb-4">
          <ErrorState message={progress.error.message} retry={() => void progress.retry()} />
        </div>
      )}
      {error && (
        <p role="alert" className="mx-5 mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {conflict && (
        <div className="m-5">
          <RecordConflict
            author="Equipe docente"
            updatedAt={latest?.module.updatedAt}
            onReviewed={() => {
              if (!latest || !query.data) return;
              setOverride({ source: query.data, module: latest.module, items: latest.items });
              setConflict(false);
              setError('');
              setLatest(null);
            }}
          >
            <p>
              A ordem anterior foi mantida. Confira a sequência atual antes de fazer um novo
              movimento.
            </p>
            {latest ? (
              <ol className="list-inside list-decimal">
                {latest.items.map((item) => (
                  <li key={item.id}>{item.title}</li>
                ))}
              </ol>
            ) : (
              <Button variant="secondary" onClick={() => void inspect()}>
                Consultar ordem atual
              </Button>
            )}
          </RecordConflict>
        </div>
      )}
      {canEdit && (
        <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
          <Button
            variant="secondary"
            onClick={() => {
              client.saveDraft(`material-open:${module.id}`, true, sessionKey);
              setComposer(true);
            }}
          >
            <Upload aria-hidden="true" className="size-4" />
            Enviar materiais
          </Button>
        </div>
      )}
      {composer && canEdit && (
        <MaterialComposer
          moduleId={module.id}
          onClose={close}
          onPublished={() => {
            onChanged?.();
            void query.invalidate();
          }}
        />
      )}
    </>
  );
}
