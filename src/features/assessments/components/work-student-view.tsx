'use client';

import { RecordConflict } from '@/components/shared/record-conflict';
import { Badge, Button, Card, Dialog, Input } from '@/components/ui';
import { brazilDateTimeLabel, countLabel } from '@/lib/utils';
import type { AssessmentRead, SubmissionStudent, WorkFeedback } from '../api';
import { useWorkSubmission } from '../hooks/use-work-submission';
import { WorkAttachments } from './work-attachments';

function FeedbackPublication({
  feedback,
  maxGrade
}: {
  feedback: WorkFeedback | null;
  maxGrade: number | null;
}) {
  if (!feedback)
    return (
      <Card className="mt-6">
        <p role="status" className="text-sm text-slate-600">
          Aguardando feedback do professor.
        </p>
      </Card>
    );
  return (
    <Card className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Feedback disponível</h2>
        {feedback.grade !== null && (
          <Badge tone="green">
            Nota {feedback.grade}
            {maxGrade !== null ? ` / ${maxGrade}` : ''}
          </Badge>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
        {feedback.comment}
      </p>
      <p className="text-xs text-slate-500">
        {feedback.author.name} · {brazilDateTimeLabel(feedback.createdAt)}
      </p>
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
        <p role="status" className="text-sm leading-7">
          Somente consulta — esta atividade não foi atribuída à sua matrícula.
        </p>
      </Card>
    );

  if (w.submission?.submittedAt)
    return (
      <>
        <Card>
          <Badge tone="green">Entrega confirmada</Badge>
          <h2 className="mt-4 font-semibold">Comprovante de entrega</h2>
          <p className="mt-3 text-sm [overflow-wrap:anywhere]">
            {activity.title} ·{' '}
            {brazilDateTimeLabel(w.submission.receipt?.submittedAt ?? w.submission.submittedAt)}{' '}
            (Brasília)
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {countLabel(w.submission.attachments.length, 'anexo', 'anexos')}
          </p>
          <WorkAttachments items={w.submission.attachments} />
        </Card>
        <FeedbackPublication
          feedback={w.submission.feedbackPublished}
          maxGrade={activity.maxGrade}
        />
      </>
    );

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Preparar entrega</h2>
      <p className="text-sm leading-6 text-slate-500">
        Até 5 anexos (arquivos de até 10 MB ou links).
      </p>
      {w.notice && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
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
      <Input
        label="Adicionar arquivos"
        type="file"
        multiple
        disabled={w.busy || !!w.conflict || w.frozenPending}
        onChange={(event) => {
          void w.addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      {Object.entries(w.uploads)
        .filter(([id]) => !w.files[id])
        .map(([id, upload]) => (
          <p key={id} role="status" className="text-xs text-amber-800">
            Selecione novamente “{upload.name}” para repetir o mesmo envio de arquivo.
          </p>
        ))}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (w.link.trim() && !w.busy && !w.conflict && !w.frozenPending) w.addLink();
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            label="Link do trabalho"
            type="url"
            value={w.link}
            onChange={(event) => w.setLink(event.target.value)}
            placeholder="https://"
            disabled={w.busy || !!w.conflict || w.frozenPending}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          disabled={!w.link.trim() || w.busy || !!w.conflict || w.frozenPending}
        >
          Adicionar link
        </Button>
      </form>
      <WorkAttachments
        items={w.items}
        files={w.files}
        onRemove={w.busy || !!w.conflict || w.frozenPending ? undefined : w.remove}
      />
      {w.error && (
        <p role="alert" className="text-sm text-rose-700">
          {w.error}
        </p>
      )}
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
      <Dialog
        open={w.confirm}
        onClose={() => {
          if (!w.busy) w.setConfirm(false);
        }}
        title="Confirmar entrega única"
      >
        <p className="text-sm leading-7 [overflow-wrap:anywhere]">
          Enviar {w.items.length === 1 ? 'este 1 anexo' : `estes ${w.items.length} anexos`} para{' '}
          {activity.title}? A entrega fica registrada uma única vez e os anexos não poderão ser
          substituídos.
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
