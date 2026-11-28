'use client';

import { useEffect, useId, useState, type DragEvent } from 'react';
import { Link2, Paperclip, X } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import { Button, Dialog, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useForumApi } from '../hooks/use-forum';
import { useForumComposer, type ForumComposerContext } from '../hooks/use-forum-composer';
import { ForumAttachments } from './forum-attachments';
import { SubjectCombobox, type SubjectOption } from './subject-combobox';
import { TagsInput } from './tags-input';

export function ForumComposerDialog({
  open,
  onClose,
  initialContext,
  subjects,
  onPublished
}: {
  open: boolean;
  onClose: () => void;
  initialContext: ForumComposerContext;
  subjects: readonly SubjectOption[];
  onPublished: () => void;
}) {
  const { user } = useSession();
  const api = useForumApi();
  const composer = useForumComposer({
    userId: user?.id,
    initialContext,
    subjects,
    onPublished
  });
  const fileId = useId();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) composer.clearError();
  }, [open, composer.clearError]);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (composer.busy || !composer.targetSubject || composer.hasPendingCreate) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) composer.chooseFile(dropped);
  };

  return (
    <>
      {composer.draftError && !open && (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {composer.draftError}
        </p>
      )}
      <Dialog
        open={open}
        onClose={() => {
          if (!composer.busy) onClose();
        }}
        title="Fazer uma pergunta"
      >
        <form onSubmit={composer.submit} className="space-y-5">
          <fieldset disabled={composer.busy || composer.hasPendingCreate} className="space-y-4">
            <SubjectCombobox
              value={composer.targetSubject}
              options={subjects}
              disabled={composer.busy || composer.hasPendingCreate}
              onChange={composer.changeSubject}
            />

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Título da pergunta
                  <span aria-hidden="true" className="ml-0.5 text-rose-600">
                    *
                  </span>
                </span>
                <span className="text-xs text-slate-400 tabular-nums">
                  {composer.title.length}/180
                </span>
              </div>
              <Input
                aria-label="Título da pergunta"
                placeholder="Ex.: Como montar uma regra de três composta?"
                value={composer.title}
                onChange={(event) => composer.setTitle(event.target.value)}
                required
                minLength={8}
                maxLength={180}
              />
            </div>

            <Textarea
              label="Conte sua dúvida"
              placeholder="Descreva o ponto em que travou, o que já tentou fazer ou qual parte ficou confusa…"
              value={composer.body}
              onChange={(event) => composer.setBody(event.target.value)}
              required
              minLength={10}
              rows={5}
            />

            <TagsInput
              value={composer.tags}
              disabled={composer.busy || composer.hasPendingCreate}
              onChange={composer.setTags}
            />

            {composer.reference && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-2.5 text-sm text-brand-900">
                <span className="inline-flex items-center gap-2 font-medium">
                  <Link2 aria-hidden="true" className="size-4 text-brand-600" />
                  Referência vinculada:{' '}
                  {composer.reference.startsWith('material:')
                    ? 'Material da disciplina'
                    : 'Questão do banco'}
                </span>
                <button
                  type="button"
                  aria-label="Remover referência vinculada"
                  onClick={composer.clearReference}
                  className="inline-flex size-6 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200/60"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-slate-700">
                Anexo <span className="font-normal text-slate-400">(opcional)</span>
              </span>
              {!composer.attachment ? (
                <label
                  htmlFor={fileId}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!composer.busy && composer.targetSubject && !composer.hasPendingCreate) {
                      setDragging(true);
                    }
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  className={cn(
                    'flex cursor-pointer items-center gap-3.5 rounded-xl border border-dashed px-4 py-3.5 transition-colors',
                    dragging
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-300 bg-slate-50/70 hover:border-brand-300 hover:bg-brand-50/40',
                    (composer.busy || !composer.targetSubject || composer.hasPendingCreate) &&
                      'cursor-not-allowed opacity-50'
                  )}
                >
                  <input
                    key={composer.fileInputVersion}
                    id={fileId}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    disabled={composer.busy || !composer.targetSubject || composer.hasPendingCreate}
                    onChange={(event) => composer.chooseFile(event.target.files?.[0])}
                    className="sr-only"
                  />
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100/80 text-brand-700">
                    <Paperclip aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">
                      {composer.busy
                        ? 'Enviando anexo…'
                        : 'Clique para anexar ou arraste um arquivo'}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      PDF, PNG, JPEG ou WebP · até 5 MB
                    </span>
                  </span>
                </label>
              ) : (
                <ForumAttachments
                  item={composer.attachment}
                  readContent={(id, inline) => api.readFileContent(id, inline)}
                  onRemove={composer.removeFile}
                />
              )}
            </div>

            {composer.legacyAttachment && (
              <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                O anexo legado “{composer.legacyAttachment.name}” foi preservado no rascunho local e
                não será enviado automaticamente. Selecione o arquivo novamente para anexá-lo a esta
                publicação.{' '}
                <Button type="button" variant="ghost" onClick={composer.clearLegacyAttachment}>
                  Remover da composição
                </Button>
              </p>
            )}
            {composer.draftError && (
              <p role="alert" className="text-sm text-rose-700">
                {composer.draftError}
              </p>
            )}
          </fieldset>

          {composer.error && (
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {composer.error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <Button
              variant="secondary"
              type="button"
              disabled={composer.busy}
              onClick={() => {
                if (!composer.busy) onClose();
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={composer.busy || !composer.targetSubject}
              loading={composer.busy}
            >
              {composer.hasPendingCreate ? 'Tentar publicar novamente' : 'Publicar pergunta'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
