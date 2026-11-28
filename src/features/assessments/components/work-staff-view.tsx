'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, LinkButton, PageHeading } from '@/components/ui';
import { brazilDateTimeLabel, cn, countLabel } from '@/lib/utils';
import type { AssessmentRead, SubmissionStaff } from '../api';
import { ActivityConditions } from './activity-conditions';
import { FeedbackEditor } from './feedback-editor';
import { WorkAttachments } from './work-attachments';

export function WorkStaffView({
  activity,
  filtered,
  selected,
  selectedId,
  pendingStudents,
  onPublished
}: {
  activity: AssessmentRead;
  filtered: SubmissionStaff[];
  selected: SubmissionStaff | undefined;
  selectedId: string | null;
  pendingStudents: { id: string; name: string }[];
  onPublished: () => void;
}) {
  const totalEnrolled = filtered.length + pendingStudents.length;
  return (
    <>
      <LinkButton secondary href="/questionarios" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para atividades
      </LinkButton>
      <PageHeading
        title={activity.title}
        description={activity.description}
        action={
          <LinkButton secondary href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}>
            Editar atividade
          </LinkButton>
        }
      />
      <ActivityConditions activity={activity} />
      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Entregas ({filtered.length})</h2>
            {totalEnrolled > filtered.length && (
              <span className="text-xs text-slate-500">
                {filtered.length} de {totalEnrolled} entregaram
              </span>
            )}
          </div>
          {filtered.length ? (
            <ul className="divide-y divide-slate-100">
              {filtered.map((submission) => {
                const isSelected = submission.id === selected?.id;
                return (
                  <li key={submission.id}>
                    <Link
                      aria-label={`Consultar entrega de ${submission.studentName}`}
                      aria-current={isSelected ? 'page' : undefined}
                      href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}&entrega=${encodeURIComponent(submission.id)}`}
                      className={cn(
                        'block border-l-2 px-5 py-4 transition-colors hover:bg-slate-50',
                        isSelected ? 'border-l-brand-600 bg-brand-50/60' : 'border-l-transparent'
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 [overflow-wrap:anywhere]">
                          {submission.studentName}
                        </span>
                        <Badge tone={submission.feedbackPublished ? 'green' : 'amber'}>
                          {submission.feedbackPublished ? 'Avaliada' : 'Aguardando'}
                        </Badge>
                      </div>
                      {submission.submittedAt && (
                        <p className="mt-1 text-xs text-slate-500">
                          {brazilDateTimeLabel(submission.submittedAt)}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-5 text-sm leading-6 text-slate-600">Nenhuma entrega concluída ainda.</p>
          )}
          {pendingStudents.length > 0 && (
            <div className="border-t border-slate-200 bg-slate-50/60">
              <p className="px-5 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sem entrega ({pendingStudents.length})
              </p>
              <ul className="divide-y divide-slate-100">
                {pendingStudents.map((student) => (
                  <li
                    key={student.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                  >
                    <span className="text-sm text-slate-700 [overflow-wrap:anywhere]">
                      {student.name}
                    </span>
                    <Badge tone="neutral">Não entregue</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <div className="min-w-0">
          {selected ? (
            <>
              <Card>
                <h2 className="font-semibold">Entrega de {selected.studentName}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {selected.submittedAt
                    ? `Enviado em ${brazilDateTimeLabel(selected.submittedAt)} (Brasília)`
                    : 'Entrega registrada'}{' '}
                  · {countLabel(selected.attachments.length, 'anexo', 'anexos')}
                </p>
                <WorkAttachments items={selected.attachments} />
              </Card>
              <FeedbackEditor
                key={selected.id}
                activity={activity}
                submission={selected}
                onPublished={onPublished}
              />
            </>
          ) : selectedId ? (
            <Card>
              <p role="status" className="text-sm text-slate-600">
                Entrega indisponível.
              </p>
            </Card>
          ) : (
            filtered.length > 0 && (
              <Card>
                <p className="text-sm text-slate-500">
                  Selecione uma entrega ao lado para revisar os anexos e publicar o retorno.
                </p>
              </Card>
            )
          )}
        </div>
      </div>
    </>
  );
}
