'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { useApp, useSession } from '@/providers/app-context';
import {
  Button,
  Dialog,
  Empty,
  ErrorState,
  Input,
  Select,
  Skeleton,
  Textarea
} from '@/components/ui';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useHttpEditor } from '@/hooks/use-http-editor';
import { videoSource } from '@/lib/material-video';
import { brazilDateTimeLabel, countLabel } from '@/lib/utils';
import type { TrailModule } from '@/models';
import type { createMaterialsApi, MaterialDto, MaterialEdit } from '../api';
import { useMaterialsApi } from '../hooks/use-materials';
import {
  createMaterialPublication,
  type PublicationInput,
  type PublicationState
} from '../lib/material-publication';
import { publicationPreparation } from '../lib/material-preparation';

type Context = Awaited<ReturnType<ReturnType<typeof createMaterialsApi>['context']>> & {
  material?: MaterialDto;
};

function ComposerForm({
  context,
  onClose,
  onPublished,
  closeRef
}: {
  context: Context;
  onClose: () => void;
  onPublished?: () => void;
  closeRef: React.RefObject<() => void>;
}) {
  const { client, sessionKey } = useSession();
  const { notify } = useApp();
  const api = useMaterialsApi();
  const { material, module, subject } = context;
  const draftKey = `material-fields:${module.id}:${material?.id ?? 'new'}`;
  const preparationStore = useMemo(
    () =>
      publicationPreparation<PublicationState>(module.id, !!material, {
        read: (key) => client.readDraft<PublicationState>(key),
        save: (key, value) => client.saveDraft(key, value, sessionKey),
        clear: (key) => client.clearDraft(key, sessionKey)
      }),
    [client, module.id, material, sessionKey]
  );
  const state = useHttpEditor<PublicationInput, MaterialDto | TrailModule>(
    {
      moduleId: module.id,
      kind: material?.kind ?? 'pdf',
      title: material?.title ?? '',
      content: material?.content ?? '',
      duration: material?.duration ?? 10,
      videoUrl: material?.videoUrl ?? '',
      files: []
    },
    material?.revision ?? module.revision ?? 1,
    draftKey
  );
  const [preparation, setPreparation] = useState<PublicationState>(
    () => preparationStore.read() ?? { stages: [], uncertain: false }
  );
  const [publication] = useState(() =>
    createMaterialPublication(
      {
        isCurrent: () =>
          client.getSnapshot().status === 'authenticated' &&
          client.getSnapshot().sessionKey === sessionKey,
        upload: (file, parentId, intent, signal) =>
          api.files.upload('material', parentId, file, intent, signal),
        discard: api.files.discard,
        batch: api.batch
      },
      preparationStore.read(),
      (next) => {
        setPreparation(next);
        preparationStore.save(next);
      }
    )
  );
  useEffect(() => () => publication.cancel(), [publication]);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState('');
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [durationInput, setDurationInput] = useState(() => String(state.fields.duration));
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const fields = state.fields;
  const uncertain = preparation.uncertain || (!!preparation.pending && !state.busy);
  const close = () => {
    if (state.busy) return;
    setConfirmingClose(true);
  };
  const continueEditing = () => {
    setConfirmingClose(false);
    requestAnimationFrame(() =>
      form.current
        ?.querySelector<HTMLElement>('select:not(:disabled), button:not(:disabled)')
        ?.focus()
    );
  };
  useLayoutEffect(() => {
    closeRef.current = () => (confirmingClose ? continueEditing() : close());
    return () => {
      closeRef.current = onClose;
    };
  });
  const confirmClose = async () => {
    if (uncertain) {
      onClose();
      return;
    }
    await preparationStore.discard(() => publication.discard());
    state.clear();
    preparationStore.clear();
    onClose();
  };
  const addFiles = (incoming: File[]) => {
    if (state.busy || uncertain) return;
    setLocalError('');
    if (fields.files.length + incoming.length > 10) {
      setLocalError('Envie até 10 PDFs por vez.');
      return;
    }
    if (
      incoming.some(
        (file) =>
          !file.name.toLowerCase().endsWith('.pdf') ||
          (file.type && file.type !== 'application/pdf') ||
          file.size === 0 ||
          file.size > 10 * 1024 * 1024
      )
    ) {
      setLocalError('Selecione PDFs válidos, não vazios, de até 10 MB cada.');
      return;
    }
    const files = incoming
      .filter(
        (file) =>
          !fields.files.some((item) => item.file.name === file.name && item.file.size === file.size)
      )
      .map((file) => ({
        localId: crypto.randomUUID(),
        file,
        title: file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ')
      }));
    state.editor.change({ ...fields, files: [...fields.files, ...files] });
  };
  const save = async () => {
    setLocalError('');
    const ok = await state.editor.submit(
      async (values, revision) => {
        if (!material) return publication.publish(values, revision);
        if (!values.title.trim() || (material.kind === 'lesson' && !values.content.trim()))
          throw new Error('Preencha o título e o conteúdo obrigatório.');
        const edit: MaterialEdit = {
          title: values.title.trim(),
          content: values.content.trim(),
          duration: values.duration
        };
        if (material.kind === 'video') {
          if (values.videoUrl.trim()) {
            const source = videoSource(values.videoUrl);
            if (!source)
              throw new Error('Informe uma URL HTTPS válida para o vídeo, sem credenciais.');
            edit.videoUrl = source.url;
          } else if (material.videoUrl)
            throw new Error('Informe uma URL HTTPS válida para o vídeo.');
        }
        return api.edit(material.id, edit, revision);
      },
      material
        ? async () => (await api.read(material.id)).material
        : async () => (await api.context(module.id)).module
    );
    if (ok && client.getSnapshot().sessionKey === sessionKey) {
      state.clear();
      preparationStore.clear();
      notify(material ? 'Material atualizado.' : 'Materiais publicados.');
      onPublished?.();
      onClose();
    }
  };
  return (
    <>
      <p className="mb-5 rounded-lg bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-900">
        <span className="block text-xs text-brand-700">Destino</span>
        <strong>{subject.name}</strong> / {module.title}
      </p>
      {confirmingClose ? (
        <div role="alert" className="space-y-4">
          <p>
            {uncertain
              ? 'A publicação ainda precisa ser conferida. Fechar guarda o preenchimento nesta sessão para retomar a conferência.'
              : 'Descartar as alterações não salvas deste material?'}
          </p>
          <div className="flex justify-end gap-2">
            <Button autoFocus variant="secondary" onClick={continueEditing}>
              Continuar editando
            </Button>
            <Button onClick={() => void confirmClose()}>
              {uncertain ? 'Fechar e guardar' : 'Descartar alterações'}
            </Button>
          </div>
        </div>
      ) : (
        <form
          ref={form}
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {material && (
            <p className="text-xs text-slate-500">
              Autoria: {material.author.name}.
              {material.updatedAt &&
                ` Última alteração: ${brazilDateTimeLabel(material.updatedAt)}.`}
            </p>
          )}
          {state.conflicted && (
            <RecordConflict
              author="Equipe docente"
              updatedAt={state.latest?.updatedAt}
              onReviewed={state.editor.acknowledge}
            >
              {state.latest ? (
                <>
                  <p className="font-semibold">
                    {'title' in state.latest ? state.latest.title : ''}
                  </p>
                  <p>
                    {'content' in state.latest ? state.latest.content : state.latest.description}
                  </p>
                  {'duration' in state.latest && (
                    <>
                      <p>
                        Tempo de estudo atual:{' '}
                        {countLabel(state.latest.duration, 'minuto', 'minutos')}
                      </p>
                      {state.latest.kind === 'video' && (
                        <p className="break-all">
                          URL atual do vídeo: {state.latest.videoUrl || 'Sem fonte disponível'}
                        </p>
                      )}
                    </>
                  )}
                  <p>
                    Seu preenchimento e seus arquivos foram mantidos. A publicação exige a revisão
                    conferida do destino.
                  </p>
                </>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void state.editor.review(
                      material
                        ? async () => (await api.read(material.id)).material
                        : async () => (await api.context(module.id)).module
                    )
                  }
                >
                  Consultar versão atual
                </Button>
              )}
            </RecordConflict>
          )}
          <fieldset disabled={state.busy || uncertain} className="space-y-5">
            <Select
              label="O que deseja publicar?"
              value={fields.kind}
              disabled={!!material}
              onChange={(event) =>
                state.editor.change({
                  ...fields,
                  kind: event.target.value as PublicationInput['kind']
                })
              }
            >
              <option value="pdf">Arquivos PDF</option>
              <option value="lesson">Texto de apoio</option>
              <option value="video">Vídeo por URL</option>
            </Select>
            {material || fields.kind !== 'pdf' ? (
              <>
                <Input
                  label="Título do material"
                  value={fields.title}
                  onChange={(event) =>
                    state.editor.change({ ...fields, title: event.target.value })
                  }
                  required
                  maxLength={160}
                />
                {material?.file && (
                  <p className="text-sm text-slate-600">Arquivo preservado: {material.file.name}</p>
                )}
              </>
            ) : (
              <>
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!state.busy) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    addFiles(Array.from(event.dataTransfer.files));
                  }}
                  className={`relative rounded-xl border-2 border-dashed p-5 text-center ${dragging ? 'border-brand-600 bg-brand-100' : 'border-brand-200 bg-brand-50/40'}`}
                >
                  <Upload aria-hidden="true" className="mx-auto mb-3 size-6 text-brand-600" />
                  <p className="text-sm font-medium">Arraste os PDFs para cá</p>
                  <p className="mb-3 mt-1 text-xs text-slate-500">
                    Até 10 arquivos · 10 MB por arquivo
                  </p>
                  <Button variant="secondary" onClick={() => input.current?.click()}>
                    Selecionar arquivos
                  </Button>
                  <input
                    ref={input}
                    aria-label="Selecionar PDFs"
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(event) => {
                      addFiles(Array.from(event.target.files ?? []));
                      event.target.value = '';
                    }}
                  />
                </div>
                <div className="space-y-3" aria-live="polite">
                  {fields.files.map((item, index) => (
                    <div key={item.localId} className="flex items-end gap-2">
                      <FileText
                        aria-hidden="true"
                        className="mb-3 size-5 shrink-0 text-brand-600"
                      />
                      <div className="min-w-0 flex-1">
                        <Input
                          label={`Título do arquivo ${index + 1}`}
                          value={item.title}
                          required
                          maxLength={160}
                          onChange={(event) =>
                            state.editor.change({
                              ...fields,
                              files: fields.files.map((file) =>
                                file.localId === item.localId
                                  ? { ...file, title: event.target.value }
                                  : file
                              )
                            })
                          }
                        />
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {item.file.name} · {(item.file.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        aria-label={`Remover ${item.file.name}`}
                        onClick={() =>
                          state.editor.change({
                            ...fields,
                            files: fields.files.filter((file) => file.localId !== item.localId)
                          })
                        }
                      >
                        <X aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {fields.kind === 'video' && (
              <>
                <Input
                  label="URL do vídeo"
                  type="url"
                  required={!material || !!material.videoUrl}
                  value={fields.videoUrl}
                  onChange={(event) =>
                    state.editor.change({ ...fields, videoUrl: event.target.value })
                  }
                />
                <p className="text-xs leading-5 text-slate-500">Use um link HTTPS válido.</p>
              </>
            )}
            <Textarea
              rows={fields.kind === 'pdf' ? 2 : 4}
              label={
                fields.kind === 'pdf'
                  ? 'Orientações para a turma (opcional)'
                  : fields.kind === 'video'
                    ? 'Texto de apoio ao vídeo (opcional)'
                    : 'Texto de apoio'
              }
              value={fields.content}
              onChange={(event) => state.editor.change({ ...fields, content: event.target.value })}
              required={fields.kind === 'lesson'}
            />
            <details className="text-sm text-slate-600">
              <summary className="py-2 font-medium">Mais opções</summary>
              <div className="mt-2">
                <Input
                  label="Tempo estimado de estudo (minutos)"
                  type="number"
                  min={1}
                  max={600}
                  value={durationInput}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setDurationInput(raw);
                    if (raw !== '') state.editor.change({ ...fields, duration: Number(raw) });
                  }}
                  required
                />
              </div>
            </details>
          </fieldset>
          {uncertain && (
            <p
              role="status"
              className="rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-900"
            >
              A resposta da publicação não foi confirmada. Seus dados e arquivos estão guardados
              nesta sessão. Confira a mesma publicação antes de alterar o preenchimento ou iniciar
              outra.
            </p>
          )}
          {(state.error || localError) && (
            <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
              {state.error || localError}
            </p>
          )}
          {state.blocked && (
            <p className="text-sm text-slate-600">
              Seu acesso ou esta intenção não está disponível. Confira o estado atual da disciplina
              antes de iniciar outra alteração.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="secondary" disabled={state.busy} onClick={() => void close()}>
              Cancelar
            </Button>
            <Button type="submit" loading={state.busy} disabled={state.conflicted || state.blocked}>
              {uncertain
                ? 'Conferir publicação'
                : material
                  ? 'Salvar material'
                  : fields.kind === 'pdf' && fields.files.length > 1
                    ? `Publicar ${fields.files.length} materiais`
                    : 'Publicar material'}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

export function MaterialComposer({
  moduleId,
  materialId,
  onClose,
  onPublished
}: {
  moduleId: string;
  materialId?: string;
  onClose: () => void;
  onPublished?: () => void;
}) {
  const closeRef = useRef(onClose);
  const { sessionKey } = useSession();
  const api = useMaterialsApi();
  const query = useHttpQuery(
    { sessionKey, key: ['materials', 'composer', moduleId, materialId ?? 'new'] },
    useCallback(
      async (signal) => {
        if (materialId) {
          const detail = await api.read(materialId, signal);
          return { module: detail.module, subject: detail.subject, material: detail.material };
        }
        return api.context(moduleId, signal);
      },
      [api, moduleId, materialId]
    )
  );
  const context = query.data;
  const available = !query.loading && !query.error && context?.subject.canManageContent;
  const title = query.loading
    ? 'Material'
    : !available
      ? 'Material indisponível'
      : materialId
        ? 'Editar material'
        : 'Publicar materiais';
  return (
    <Dialog open onClose={() => closeRef.current()} title={title}>
      {query.loading ? (
        <Skeleton />
      ) : query.error ? (
        <ErrorState message={query.error.message} retry={() => void query.retry()} />
      ) : !available ? (
        <Empty
          title="Seu acesso a este conteúdo não está disponível"
          description="A atribuição ou o conteúdo pode ter sido retirado. Nada foi publicado."
          action={<Button onClick={onClose}>Fechar</Button>}
        />
      ) : (
        <ComposerForm
          context={context}
          onClose={onClose}
          onPublished={onPublished}
          closeRef={closeRef}
        />
      )}
    </Dialog>
  );
}
