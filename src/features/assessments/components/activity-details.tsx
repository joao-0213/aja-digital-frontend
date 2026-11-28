'use client';

import type { ReactNode } from 'react';
import {
  ArrowLeft,
  Award,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  FileUp,
  Info,
  ListChecks,
  Pencil,
  ShieldCheck,
  Users
} from 'lucide-react';
import { Badge, Card, LinkButton } from '@/components/ui';
import { brazilDateTimeLabel, countLabel, formatScore } from '@/lib/utils';
import {
  isStaffAssessment,
  type AssessmentRead,
  type AttemptRead,
  type SubmissionRead
} from '../api';

function MetaTile({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3.5">
      <span className="mt-0.5 shrink-0 text-brand-600">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd className="mt-0.5 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
          {value}
        </dd>
      </div>
    </div>
  );
}

export function ActivityDetails({
  activity,
  canManage,
  userId,
  attempts,
  submissions,
  subjectName,
  moduleNumber
}: {
  activity: AssessmentRead;
  canManage: boolean;
  userId: string;
  attempts: AttemptRead[];
  submissions: SubmissionRead[];
  subjectName?: string;
  moduleNumber?: number | null;
}) {
  const staff = isStaffAssessment(activity);
  const isWork = activity.kind === 'work';
  const questionCount = staff ? activity.questionIds.length : activity.questionCount;
  const related = attempts.filter(
    (attempt) => attempt.assessmentId === activity.id && (canManage || attempt.userId === userId)
  );
  const activeAttempt = related.find((attempt) => !attempt.submittedAt);
  const submitted = related.filter((attempt) => attempt.submittedAt);
  const workSubmissions = submissions.filter(
    (submission) =>
      submission.assessmentId === activity.id && (canManage || submission.userId === userId)
  );
  const ownWork = workSubmissions.find(() => !canManage) ?? workSubmissions[0];
  const isAssigned = 'assigned' in activity ? activity.assigned : true;
  const HeroIcon = isWork ? FileUp : ClipboardCheck;
  const eyebrow = subjectName
    ? [subjectName, moduleNumber ? `Módulo ${moduleNumber}` : null].filter(Boolean).join(' · ')
    : isWork
      ? 'Entrega de trabalho'
      : 'Questionário';

  return (
    <div className="mx-auto max-w-5xl">
      <LinkButton secondary href="/questionarios" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para atividades
      </LinkButton>

      <header className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="relative flex flex-wrap items-start justify-between gap-4 bg-brand-50/75 px-5 py-6 text-brand-700 sm:px-7 sm:py-7">
          <div className="relative z-10 flex min-w-0 flex-1 items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-brand-600 shadow-xs ring-1 ring-black/5">
              <HeroIcon aria-hidden="true" className="size-7" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold tracking-wide text-brand-700 [overflow-wrap:anywhere]">
                {eyebrow}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">
                {activity.title}
              </h1>
            </div>
          </div>
          {canManage && (
            <div className="relative z-10">
              <LinkButton
                secondary
                href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}
              >
                <Pencil aria-hidden="true" className="size-4" />
                Editar atividade
              </LinkButton>
            </div>
          )}
          <HeroIcon
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-6 right-6 hidden size-36 text-white sm:block"
            strokeWidth={1.2}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-5 py-3.5 sm:px-7">
          {activity.status === 'draft' && <Badge tone="neutral">Rascunho</Badge>}
          <Badge tone="purple">{isWork ? 'Entrega de trabalho' : 'Questionário'}</Badge>
          {activity.deadline && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 sm:ml-auto">
              <CalendarClock aria-hidden="true" className="size-3.5 text-brand-600" />
              Até {brazilDateTimeLabel(activity.deadline)} (Brasília)
            </span>
          )}
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-6">
          <Card className="space-y-5">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <FileText aria-hidden="true" className="size-4 text-brand-600" />
                <h2 className="text-base font-semibold text-slate-900">Orientações da atividade</h2>
              </div>
              {activity.description ? (
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">
                  {activity.description}
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  Nenhuma orientação adicional informada para esta atividade.
                </p>
              )}
            </div>

            <div className="border-t border-slate-100 pt-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Condições e detalhes</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <MetaTile
                  icon={<CalendarClock aria-hidden="true" className="size-4" />}
                  label="Prazo de entrega"
                  value={
                    activity.deadline
                      ? `Até ${brazilDateTimeLabel(activity.deadline)} (Brasília)`
                      : 'Sem prazo definido'
                  }
                />
                {activity.deadline && (
                  <MetaTile
                    icon={<Clock3 aria-hidden="true" className="size-4" />}
                    label="Envios atrasados"
                    value={activity.allowLate ? 'Aceitos após o prazo' : 'Não aceitos'}
                  />
                )}
                <MetaTile
                  icon={
                    isWork ? (
                      <FileUp aria-hidden="true" className="size-4" />
                    ) : (
                      <ListChecks aria-hidden="true" className="size-4" />
                    )
                  }
                  label="Composição"
                  value={
                    isWork
                      ? 'Arquivos e links'
                      : countLabel(questionCount, 'questão', 'questões')
                  }
                />
                {isWork && activity.maxGrade !== null ? (
                  <MetaTile
                    icon={<Award aria-hidden="true" className="size-4" />}
                    label="Nota máxima"
                    value={formatScore(activity.maxGrade)}
                  />
                ) : (
                  <MetaTile
                    icon={<ShieldCheck aria-hidden="true" className="size-4" />}
                    label="Regime de envio"
                    value="Envio único"
                  />
                )}
              </dl>
            </div>
          </Card>

          {staff && (
            <Card className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">Questões incluídas</h2>
                {activity.questions.length > 0 && (
                  <Badge tone="purple">
                    {countLabel(activity.questions.length, 'questão', 'questões')}
                  </Badge>
                )}
              </div>
              {activity.questions.length ? (
                <ol className="divide-y divide-slate-100">
                  {activity.questions.map((question, index) => (
                    <li key={question.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold tabular-nums text-brand-700">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-6 text-slate-800 [overflow-wrap:anywhere]">
                          {question.statement}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {question.origin === 'author'
                            ? 'Autoral desta atividade'
                            : 'Cópia do acervo'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
                  Este trabalho recebe arquivos e links enviados pelos alunos.
                </p>
              )}
            </Card>
          )}
        </div>

        <aside className="lg:sticky lg:top-6">
          {activity.kind === 'work' ? (
            <Card className="space-y-4">
              {canManage ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <Users aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-600" />
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-slate-900">Entregas da turma</h2>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {countLabel(workSubmissions.length, 'entrega concluída', 'entregas concluídas')}
                      </p>
                    </div>
                  </div>
                  {workSubmissions.length > 0 ? (
                    <LinkButton
                      className="w-full"
                      href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}
                    >
                      Consultar entregas
                    </LinkButton>
                  ) : (
                    <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-500">
                      Nenhuma entrega enviada pelos alunos até o momento.
                    </p>
                  )}
                </>
              ) : !isAssigned ? (
                <div className="flex items-start gap-2.5">
                  <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-900">Somente consulta</h2>
                    <p role="status" className="mt-1 text-sm leading-6 text-slate-600">
                      Esta atividade não foi atribuída à sua matrícula.
                    </p>
                  </div>
                </div>
              ) : ownWork?.submittedAt ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-slate-900">Sua entrega</h2>
                        <Badge tone={ownWork.feedbackPublished ? 'green' : 'amber'}>
                          {ownWork.feedbackPublished ? 'Avaliada' : 'Enviada'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Enviada em {brazilDateTimeLabel(ownWork.receipt?.submittedAt ?? ownWork.submittedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Anexos</span>
                      <span className="font-semibold text-slate-800">
                        {countLabel(ownWork.attachments.length, 'anexo', 'anexos')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Feedback</span>
                      <span className="font-semibold text-slate-800">
                        {ownWork.feedbackPublished
                          ? ownWork.feedbackPublished.grade !== null
                            ? `Nota ${formatScore(ownWork.feedbackPublished.grade)}${activity.maxGrade !== null ? ` / ${formatScore(activity.maxGrade)}` : ''}`
                            : 'Publicado'
                          : 'Aguardando correção'}
                      </span>
                    </div>
                  </div>
                  <LinkButton
                    className="w-full"
                    href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}&entrega=${encodeURIComponent(ownWork.id)}`}
                  >
                    Consultar comprovante e feedback
                  </LinkButton>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2.5">
                    <FileUp aria-hidden="true" className="size-5 shrink-0 text-brand-600" />
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">Sua entrega</h2>
                      <Badge tone={ownWork ? 'blue' : 'purple'}>
                        {ownWork ? 'Em andamento' : 'Pendente'}
                      </Badge>
                    </div>
                  </div>
                  {ownWork && (
                    <p className="text-xs leading-5 text-slate-500">
                      Rascunho salvo com {countLabel(ownWork.attachments.length, 'anexo', 'anexos')}.
                    </p>
                  )}
                  <LinkButton
                    className="w-full"
                    href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}
                  >
                    {ownWork ? 'Retomar rascunho' : 'Preparar entrega'}
                  </LinkButton>
                </>
              )}
            </Card>
          ) : (
            <Card className="space-y-4">
              {canManage ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <Users aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-600" />
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-slate-900">Envios da turma</h2>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {countLabel(submitted.length, 'envio concluído', 'envios concluídos')}
                      </p>
                    </div>
                  </div>
                  {submitted.length ? (
                    <LinkButton
                      className="w-full"
                      href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}
                    >
                      Consultar envios entregues
                    </LinkButton>
                  ) : (
                    <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-500">
                      Ainda não há envios para consulta.
                    </p>
                  )}
                </>
              ) : activity.status !== 'published' ? (
                <div className="flex items-start gap-2.5">
                  <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-900">Rascunho</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Este rascunho não está disponível para resposta.
                    </p>
                  </div>
                </div>
              ) : !isAssigned ? (
                <div className="flex items-start gap-2.5">
                  <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-900">Somente consulta</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Esta atividade não foi atribuída à sua matrícula.
                    </p>
                  </div>
                </div>
              ) : submitted.length ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-slate-900">Sua tentativa</h2>
                        <Badge tone="green">Concluída</Badge>
                      </div>
                      {submitted[0].submittedAt && (
                        <p className="mt-1 text-xs text-slate-500">
                          Enviada em {brazilDateTimeLabel(submitted[0].submittedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                  <LinkButton
                    className="w-full"
                    href={`/questionarios/resultado?id=${encodeURIComponent(submitted[0].id)}`}
                  >
                    Ver resultado
                  </LinkButton>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2.5">
                    <ClipboardCheck aria-hidden="true" className="size-5 shrink-0 text-brand-600" />
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">Sua tentativa</h2>
                      <Badge tone={activeAttempt ? 'blue' : 'purple'}>
                        {activeAttempt ? 'Em andamento' : 'Pendente'}
                      </Badge>
                    </div>
                  </div>
                  <LinkButton
                    className="w-full"
                    href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}
                  >
                    {activeAttempt ? 'Retomar questionário' : 'Iniciar questionário'}
                  </LinkButton>
                </>
              )}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
