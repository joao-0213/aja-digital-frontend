'use client';

import { ArrowLeft } from 'lucide-react';
import { Badge, Card, LinkButton } from '@/components/ui';
import { brazilDateTimeLabel, countLabel } from '@/lib/utils';
import {
  isStaffAssessment,
  type AssessmentRead,
  type AttemptRead,
  type SubmissionRead
} from '../api';

export function ActivityDetails({
  activity,
  canManage,
  userId,
  attempts,
  submissions
}: {
  activity: AssessmentRead;
  canManage: boolean;
  userId: string;
  attempts: AttemptRead[];
  submissions: SubmissionRead[];
}) {
  const staff = isStaffAssessment(activity);
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
  return (
    <>
      <LinkButton secondary href="/questionarios">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para atividades
      </LinkButton>
      <Card className="mt-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={activity.status === 'draft' ? 'neutral' : 'green'}>
                {activity.status === 'draft' ? 'Rascunho' : 'Publicada'}
              </Badge>
              <Badge>{activity.kind === 'work' ? 'Entrega de trabalho' : 'Questionário'}</Badge>
              <Badge>{activity.required ? 'Obrigatória' : 'Opcional'}</Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere]">
              {activity.title}
            </h1>
          </div>
          {canManage && (
            <LinkButton href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}>
              Editar atividade
            </LinkButton>
          )}
        </div>
        {activity.description && (
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600 [overflow-wrap:anywhere]">
            {activity.description}
          </p>
        )}
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-800">Prazo</dt>
            <dd className="mt-1 text-slate-600">
              {activity.deadline
                ? `Até ${brazilDateTimeLabel(activity.deadline)} (Brasília)`
                : 'Sem prazo'}
            </dd>
          </div>
          {activity.deadline && (
            <div>
              <dt className="font-semibold text-slate-800">Envios atrasados</dt>
              <dd className="mt-1 text-slate-600">
                {activity.allowLate ? 'Aceitos' : 'Não aceitos'}
              </dd>
            </div>
          )}
          <div>
            <dt className="font-semibold text-slate-800">Composição</dt>
            <dd className="mt-1 text-slate-600">
              {activity.kind === 'work'
                ? 'Entrega de trabalho'
                : `${questionCount} ${questionCount === 1 ? 'questão' : 'questões'}`}
            </dd>
          </div>
          {activity.kind === 'work' && activity.maxGrade !== null && (
            <div>
              <dt className="font-semibold text-slate-800">Nota máxima</dt>
              <dd className="mt-1 text-slate-600">{activity.maxGrade}</dd>
            </div>
          )}
        </dl>
        {staff && (
          <section className="border-t border-slate-100 pt-4">
            <h2 className="font-semibold">Questões incluídas</h2>
            {activity.questions.length ? (
              <ol className="mt-3 list-decimal space-y-3 pl-5">
                {activity.questions.map((question) => (
                  <li key={question.id} className="text-sm leading-6 text-slate-700">
                    {question.statement}
                    <span className="ml-2 text-xs text-slate-500">
                      {question.origin === 'author' ? 'Autoral desta atividade' : 'Cópia do acervo'}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Este trabalho recebe arquivos e links.</p>
            )}
          </section>
        )}
        {activity.kind === 'quiz' && (
          <section className="border-t border-slate-100 pt-4">
            <h2 className="font-semibold">Tentativa</h2>
            {canManage ? (
              submitted.length ? (
                <LinkButton
                  className="mt-3"
                  href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}
                >
                  Consultar envios entregues
                </LinkButton>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Ainda não há envios para consulta.</p>
              )
            ) : activity.status !== 'published' ? (
              <p className="mt-2 text-sm text-slate-500">
                Este rascunho não está disponível para resposta.
              </p>
            ) : !('assigned' in activity) || !activity.assigned ? (
              <p className="mt-2 text-sm text-slate-500">
                Disponível apenas para consulta; esta atividade não foi atribuída à sua matrícula.
              </p>
            ) : submitted.length ? (
              <LinkButton
                className="mt-3"
                href={`/questionarios/resultado?id=${encodeURIComponent(submitted[0].id)}`}
              >
                Ver resultado
              </LinkButton>
            ) : (
              <LinkButton
                className="mt-3"
                href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}
              >
                {activeAttempt ? 'Retomar questionário' : 'Iniciar questionário'}
              </LinkButton>
            )}
          </section>
        )}
        {activity.kind === 'work' && (
          <section className="border-t border-slate-100 pt-4">
            <h2 className="font-semibold">Entrega de trabalho</h2>
            {canManage ? (
              <>
                <p className="mt-2 text-sm text-slate-600">
                  {countLabel(workSubmissions.length, 'entrega concluída', 'entregas concluídas')}.
                </p>
                {workSubmissions.length > 0 && (
                  <LinkButton
                    className="mt-3"
                    href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}
                  >
                    Consultar entregas
                  </LinkButton>
                )}
              </>
            ) : !('assigned' in activity) || !activity.assigned ? (
              <p role="status" className="mt-2 text-sm text-slate-600">
                Disponível apenas para consulta; esta atividade não foi atribuída à sua matrícula.
              </p>
            ) : ownWork?.submittedAt ? (
              <LinkButton
                className="mt-3"
                href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}&entrega=${encodeURIComponent(ownWork.id)}`}
              >
                Consultar comprovante e feedback
              </LinkButton>
            ) : (
              <LinkButton
                className="mt-3"
                href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}
              >
                {ownWork ? 'Retomar rascunho' : 'Preparar entrega'}
              </LinkButton>
            )}
          </section>
        )}
      </Card>
    </>
  );
}
