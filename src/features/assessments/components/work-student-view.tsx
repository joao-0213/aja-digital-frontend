'use client';

import type { ReactNode } from 'react';
import {
  Award,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Info,
  Link2,
  Paperclip,
  ShieldCheck,
  Upload
} from 'lucide-react';
import { RecordConflict } from '@/components/shared/record-conflict';
import { Badge, Button, Card, Dialog, Input } from '@/components/ui';
import { brazilDateTimeLabel, countLabel, formatScore } from '@/lib/utils';
import type { AssessmentRead, SubmissionStudent, WorkFeedback } from '../api';
import { useWorkSubmission } from '../hooks/use-work-submission';
import { WorkAttachments } from './work-attachments';

function authorInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function ReceiptTile({
  icon,
  label,
  value,
  mono = false
}: {
  icon: ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3.5">
      <span className="mt-0.5 shrink-0 text-brand-600">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd
          className={
            mono
              ? 'mt-0.5 break-all font-mono text-xs font-semibold text-slate-800'
              : 'mt-0.5 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]'
          }
        >
          {value}
        </dd>
      </div>
    </div>
  );
}

function FeedbackPublication({
  feedback,
  maxGrade
}: {
  feedback: WorkFeedback | null;
  maxGrade: number | null;
}) {
  if (!feedback)
    return (
      <Card className="space-y-3">
        <div className="flex items-start gap-2.5">
          <Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">Avaliação e feedback</h2>
              <Badge tone="amber">Aguardando</Badge>
            </div>
            <p role="status" className="mt-1.5 text-sm leading-6 text-slate-600">
              Aguardando feedback do professor. Quando a correção for publicada, a nota e os
              comentários aparecerão aqui.
            </p>
          </div>
        </div>
      </Card>
    );

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-2.5">
        <Award aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Feedback disponível</h2>
            <Badge tone="green">Avaliada</Badge>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Publicado em {brazilDateTimeLabel(feedback.createdAt)}
          </p>
        </div>
      </div>

      {feedback.grade !== null && (
        <div className="flex items-baseline justify-between gap-3 rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Nota atribuída
          </span>
          <p className="text-2xl font-bold tabular-nums text-emerald-700">
            {formatScore(feedback.grade)}
            {maxGrade !== null && (
              <span className="text-sm font-medium text-emerald-700/75">
                {' '}
                / {formatScore(maxGrade)}
              </span>
            )}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">
          {feedback.comment}
        </p>
      </div>

      <div className="flex items-center gap-2.5 border-t border-slate-100 pt-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          {authorInitials(feedback.author.name)}
        </span>
        <div className="min-w-0 text-xs">
          <p className="truncate font-semibold text-slate-800">{feedback.author.name}</p>
          <p className="text-slate-500">Avaliador</p>
        </div>
      </div>
    </Card>
  );
}

export function WorkStudentView({
  activity,
  initialSubmission,
  userId,
  sessionId
}: {
  activity: AssessmentRead;
  initialSubmission: SubmissionStudent | null;
  userId: string;
  sessionId: string;
}) {
  const w = useWorkSubmission({ activity, initialSubmission, userId, sessionId });

  if (!w.isAssigned)
    return (
      <Card>
        <div className="flex items-start gap-2.5">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-500" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Somente consulta</h2>
            <p role="status" className="mt-1 text-sm leading-6 text-slate-600">
              Somente consulta — esta atividade não foi atribuída à sua matrícula.
            </p>
          </div>
        </div>
      </Card>
    );

  if (w.submission?.submittedAt) {
    const submittedAt = w.submission.receipt?.submittedAt ?? w.submission.submittedAt;
    return (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card padding="none" className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-emerald-700" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">Comprovante de entrega</h2>
                <p className="text-xs text-emerald-800">
                  Entrega registrada definitivamente no sistema
                </p>
              </div>
            </div>
            <Badge tone="green">Entrega confirmada</Badge>
          </div>

          <div className="space-y-6 p-5 sm:p-6">
            <dl className="grid gap-3 sm:grid-cols-2">
              <ReceiptTile
                icon={<CalendarClock aria-hidden="true" className="size-4" />}
                label="Data e hora do envio"
                value={`${brazilDateTimeLabel(submittedAt)} (Brasília)`}
              />
              <ReceiptTile
                icon={<Paperclip aria-hidden="true" className="size-4" />}
                label="Anexos enviados"
                value={countLabel(w.submission.attachments.length, 'anexo', 'anexos')}
              />
              {w.submission.receipt?.id && (
                <ReceiptTile
                  icon={<FileCheck2 aria-hidden="true" className="size-4" />}
                  label="Protocolo do comprovante"
                  value={w.submission.receipt.id}
                  mono
                />
              )}
              <ReceiptTile
                icon={<ShieldCheck aria-hidden="true" className="size-4" />}
                label="Regime de envio"
                value="Envio único (sem substituição)"
              />
            </dl>

            <section className="border-t border-slate-100 pt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Arquivos e links enviados</h3>
                <span className="text-xs font-medium text-slate-500">
                  {countLabel(w.submission.attachments.length, 'item', 'itens')}
                </span>
              </div>
              <WorkAttachments items={w.submission.attachments} />
            </section>
          </div>
        </Card>

        <aside className="lg:sticky lg:top-6">
          <FeedbackPublication
            feedback={w.submission.feedbackPublished}
            maxGrade={activity.maxGrade}
          />
        </aside>
      </div>
    );
  }

  const fileInputDisabled = w.busy || !!w.conflict || w.frozenPending;

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Preparar entrega</h2>
          <p className="mt-1 text-sm text-slate-500">
            Envie até 5 anexos (arquivos de até 10 MB ou links). Salve rascunhos antes do envio
            definitivo.
          </p>
        </div>
        <Badge tone={w.isDirty ? 'amber' : w.submission ? 'blue' : 'neutral'}>
          {w.isDirty
            ? 'Alterações não salvas'
            : w.submission
              ? `Rascunho · rev. ${w.submission.revision}`
              : 'Não entregue'}
        </Badge>
      </div>

      {w.notice && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          {w.notice}
        </p>
      )}
      {w.conflict && (
        <RecordConflict
          author="sua conta em outra sessão"
          updatedAt={w.conflict.updatedAt}
          onReviewed={w.acknowledgeConflict}
        >
          <p>Revisão atual: {w.conflict.revision}</p>
          <p>
            Anexos salvos: {w.conflict.attachments.map((item) => item.name).join(', ') || 'Nenhum'}
          </p>
          <p>
            Sua seleção local continua preservada:{' '}
            {w.items.map((item) => item.name).join(', ') || 'Nenhum'}
          </p>
        </RecordConflict>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="work-file-upload"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Adicionar arquivos
          </label>
          <label
            htmlFor="work-file-upload"
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
              fileInputDisabled
                ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                : 'cursor-pointer border-slate-300 bg-slate-50/70 text-slate-600 hover:border-brand-400 hover:bg-brand-50/30'
            }`}
          >
            <Upload aria-hidden="true" className="size-6 text-brand-600" />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Clique para selecionar arquivos
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Até 5 anexos no total · máximo de 10 MB por arquivo
              </p>
            </div>
            <input
              id="work-file-upload"
              type="file"
              multiple
              disabled={fileInputDisabled}
              className="sr-only"
              onChange={(event) => {
                void w.addFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
          </label>
        </div>

        {Object.entries(w.uploads)
          .filter(([id]) => !w.files[id])
          .map(([id, upload]) => (
            <p
              key={id}
              role="status"
              className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              Selecione novamente “{upload.name}” para repetir o mesmo envio de arquivo.
            </p>
          ))}

        <form
          className="flex flex-wrap items-end gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (w.link.trim() && !fileInputDisabled) w.addLink();
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              label="Link do trabalho"
              type="url"
              value={w.link}
              onChange={(event) => w.setLink(event.target.value)}
              placeholder="https://"
              disabled={fileInputDisabled}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            disabled={!w.link.trim() || fileInputDisabled}
          >
            <Link2 aria-hidden="true" className="size-4" />
            Adicionar link
          </Button>
        </form>
      </div>

      {w.items.length > 0 && (
        <div className="space-y-2.5 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Anexos selecionados</h3>
            <span className="text-xs font-medium text-slate-500">{w.items.length} / 5</span>
          </div>
          <WorkAttachments
            items={w.items}
            files={w.files}
            onRemove={fileInputDisabled ? undefined : w.remove}
          />
        </div>
      )}

      {w.error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {w.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p role="status" className="text-xs text-slate-500">
          {w.isDirty
            ? 'Alterações locais ainda não salvas.'
            : w.submission
              ? `Rascunho salvo · revisão ${w.submission.revision} · não enviado.`
              : 'Não entregue.'}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            loading={w.busy}
            disabled={!!w.conflict || w.hasAmbiguousPatch || w.hasAmbiguousPrepare}
            onClick={() => void w.saveDraft()}
          >
            Salvar rascunho
          </Button>
          <Button
            disabled={!w.canSubmit || w.hasAmbiguousPatch || w.hasPendingUploads}
            onClick={() => w.setConfirm(true)}
          >
            {w.hasSubmitIntent ? 'Tentar confirmar o mesmo envio' : 'Conferir e enviar'}
          </Button>
          {w.hasAmbiguousPatch && (
            <Button variant="secondary" loading={w.busy} onClick={() => void w.reviewUncertainSave()}>
              Consultar salvamento
            </Button>
          )}
          {w.hasAmbiguousPrepare && (
            <Button variant="secondary" loading={w.busy} onClick={() => void w.retryPrepare()}>
              Repetir a mesma preparação
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={w.confirm}
        onClose={() => {
          if (!w.busy) w.setConfirm(false);
        }}
        title="Confirmar entrega única"
      >
        <p className="mb-4 text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">
          Enviar {w.items.length === 1 ? 'este 1 anexo' : `estes ${w.items.length} anexos`} para{' '}
          <strong className="font-semibold text-slate-900">{activity.title}</strong>? A entrega fica
          registrada uma única vez e os anexos não poderão ser substituídos.
        </p>
        <WorkAttachments items={w.items} files={w.files} />
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" disabled={w.busy} onClick={() => w.setConfirm(false)}>
            Voltar à preparação
          </Button>
          <Button loading={w.busy} disabled={!w.canSubmit} onClick={() => void w.submit()}>
            {w.hasSubmitIntent ? 'Confirmar o mesmo envio' : 'Confirmar envio único'}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
