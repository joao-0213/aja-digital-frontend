'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarClock, ClipboardCheck, FileUp, Plus } from 'lucide-react';
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  LinkButton,
  PageHeading,
  Select,
  Skeleton
} from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { cn, countLabel } from '@/lib/utils';
import {
  moduleDisplayNumber,
  resolveActorDisplayName,
  sortByDeadlineAsc
} from '@/lib/academic-format';
import { useSession } from '@/providers/app-context';
import {
  createAssessmentsApi,
  type AssessmentRead,
  type AssessmentStaff,
  type AttemptRead,
  type SubmissionRead
} from '../api';
import { deadlineParts, groupStudentActivities } from '../lib/activity-list';

type StaffFilter = 'all' | 'draft' | 'published';
type StudentFilter = 'all' | 'pending' | 'completed';

function isStaffAssessment(activity: AssessmentRead): activity is AssessmentStaff {
  return 'questionIds' in activity;
}

function dateLabel(value: string | null) {
  if (!value) return 'Sem prazo';
  return `Até ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))} (Brasília)`;
}

function DeadlineColumn({
  deadline,
  urgent = false
}: {
  deadline: string | null;
  urgent?: boolean;
}) {
  const parts = deadlineParts(deadline);
  if (!parts) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-400 sm:w-28 sm:flex-col sm:items-start sm:gap-0.5">
        <span>Sem prazo</span>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-baseline gap-2 sm:w-28 sm:flex-col sm:gap-0.5">
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          urgent ? 'text-brand-700' : 'text-slate-700'
        )}
      >
        {parts.date}
      </span>
      <span className="text-xs tabular-nums text-slate-500">{parts.time}</span>
    </div>
  );
}

interface ActivityTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

function ActivityTabs<T extends string>({
  ariaLabel,
  tabs,
  value,
  onChange,
  subjectFilter,
  filterSubjects,
  onSubjectChange
}: {
  ariaLabel: string;
  tabs: readonly ActivityTab<T>[];
  value: T;
  onChange: (next: T) => void;
  subjectFilter: string;
  filterSubjects: { id: string; name: string }[];
  onSubjectChange: (next: string) => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:border-b sm:border-slate-200">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-wrap gap-6 border-b border-slate-200 sm:border-b-0"
      >
        {tabs.map((tab) => {
          const active = value === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.value)}
              className={cn(
                '-mb-px inline-flex min-h-12 cursor-pointer items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold transition-colors',
                active
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              )}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                    active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {filterSubjects.length > 1 && (
        <div className="w-full sm:w-64 sm:pb-2">
          <Select
            aria-label="Filtrar por disciplina"
            value={subjectFilter}
            onChange={(event) => onSubjectChange(event.target.value)}
          >
            <option value="all">Todas as disciplinas</option>
            {filterSubjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}

function ActivityDetails({
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
  const ownWork = workSubmissions.find((submission) => !canManage) ?? workSubmissions[0];
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
            <dd className="mt-1 text-slate-600">{dateLabel(activity.deadline)}</dd>
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

export function AssessmentsPage() {
  const { client, sessionKey, resourceEpoch, status, user } = useSession();
  const params = useSearchParams();
  const detailId = params.get('id');
  const [staffFilter, setStaffFilter] = useState<StaffFilter>('all');
  const [studentFilter, setStudentFilter] = useState<StudentFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const api = useMemo(() => createAssessmentsApi(client), [client]);
  const query = useHttpQuery(
    { sessionKey, key: JSON.stringify(['assessments', staffFilter, resourceEpoch]) },
    useCallback(
      (signal) =>
        api.overview(staffFilter === 'all' ? {} : { status: staffFilter }, signal, sessionKey),
      [api, staffFilter, sessionKey]
    ),
    status === 'authenticated'
  );
  const detail = useHttpQuery(
    { sessionKey, key: `assessment-detail:${detailId ?? ''}:${resourceEpoch}` },
    useCallback((signal) => api.read(detailId ?? '', signal), [api, detailId]),
    status === 'authenticated' && !!detailId
  );
  const attempts = useHttpQuery(
    { sessionKey, key: `assessment-attempts:${resourceEpoch}` },
    useCallback((signal) => api.allAttempts({}, signal, sessionKey), [api, sessionKey]),
    status === 'authenticated'
  );
  const submissions = useHttpQuery(
    { sessionKey, key: `assessment-submissions:${resourceEpoch}` },
    useCallback((signal) => api.allSubmissions({}, signal, sessionKey), [api, sessionKey]),
    status === 'authenticated'
  );

  if (status === 'loading') return <Skeleton />;
  if (status !== 'authenticated' || !user)
    return (
      <Empty
        title="Entre para consultar atividades"
        description="As atividades da disciplina aparecem para a conta autenticada."
      />
    );
  if (detailId) {
    if (detail.loading) return <Skeleton />;
    if (detail.error)
      return <ErrorState message={detail.error.message} retry={() => void detail.retry()} />;
    if (!detail.data)
      return (
        <Empty
          title="Atividade indisponível"
          action={<LinkButton href="/questionarios">Voltar para atividades</LinkButton>}
        />
      );
    if (detail.data.kind === 'work' && submissions.loading) return <Skeleton />;
    if (detail.data.kind === 'work' && submissions.error)
      return (
        <ErrorState message={submissions.error.message} retry={() => void submissions.retry()} />
      );
    if (attempts.loading) return <Skeleton />;
    if (attempts.error)
      return <ErrorState message={attempts.error.message} retry={() => void attempts.retry()} />;
    return (
      <ActivityDetails
        activity={detail.data}
        canManage={user.role !== 'student'}
        userId={user.id}
        attempts={attempts.data ?? []}
        submissions={submissions.data ?? []}
      />
    );
  }
  if (query.loading) return <Skeleton />;
  if (query.error)
    return <ErrorState message={query.error.message} retry={() => void query.retry()} />;
  if (attempts.loading) return <Skeleton />;
  if (attempts.error)
    return <ErrorState message={attempts.error.message} retry={() => void attempts.retry()} />;
  if (submissions.loading) return <Skeleton />;
  if (submissions.error)
    return (
      <ErrorState message={submissions.error.message} retry={() => void submissions.retry()} />
    );

  const moduleList = query.data?.modules ?? [];
  const subjectList = query.data?.subjects ?? [];
  const modules = new Map(moduleList.map((module) => [module.id, module]));
  const subjects = new Map(subjectList.map((subject) => [subject.id, subject]));
  const staff = user.role !== 'student';
  const canCreate =
    staff && moduleList.some((module) => subjects.get(module.subjectId)?.canManageContent);
  const allAssessments = query.data?.assessments ?? [];
  const subjectIdsWithActivities = new Set(
    allAssessments
      .map((item) => modules.get(item.moduleId)?.subjectId)
      .filter((id): id is string => !!id)
  );
  const filterSubjects = subjectList.filter((subject) => subjectIdsWithActivities.has(subject.id));
  const scopedAssessments =
    subjectFilter === 'all'
      ? allAssessments
      : allAssessments.filter((item) => modules.get(item.moduleId)?.subjectId === subjectFilter);

  if (!staff) {
    const allGroups = groupStudentActivities(
      scopedAssessments,
      user.id,
      attempts.data ?? [],
      submissions.data ?? []
    );
    const pendingCount = allGroups.find((group) => group.key === 'pending')?.entries.length ?? 0;
    const completedCount =
      (allGroups.find((group) => group.key === 'completed')?.entries.length ?? 0) +
      (allGroups.find((group) => group.key === 'awaiting_feedback')?.entries.length ?? 0);
    const visibleGroups = allGroups.filter((group) => {
      if (studentFilter === 'pending') return group.key === 'pending';
      if (studentFilter === 'completed')
        return group.key === 'completed' || group.key === 'awaiting_feedback';
      return true;
    });

    return (
      <>
        <LinkButton secondary href="/" className="mb-5">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Voltar ao painel
        </LinkButton>
        <PageHeading title="Atividades" />
        <ActivityTabs
          ariaLabel="Filtrar atividades por situação"
          tabs={
            [
              { value: 'all', label: 'Todas', count: scopedAssessments.length },
              { value: 'pending', label: 'Pendentes', count: pendingCount },
              { value: 'completed', label: 'Concluídas', count: completedCount }
            ] as const
          }
          value={studentFilter}
          onChange={setStudentFilter}
          subjectFilter={subjectFilter}
          filterSubjects={filterSubjects}
          onSubjectChange={setSubjectFilter}
        />

        {visibleGroups.length ? (
          <div className="space-y-7">
            {visibleGroups.map((group) => (
              <section key={group.key} aria-labelledby={`activities-group-${group.key}`}>
                <div className="mb-3 flex items-center gap-2">
                  <h2
                    id={`activities-group-${group.key}`}
                    className="text-sm font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {group.title}
                  </h2>
                  <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                    {group.entries.length}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {group.entries.map(({ activity, status: itemStatus }) => {
                    const mod = modules.get(activity.moduleId);
                    const subject = mod && subjects.get(mod.subjectId);
                    const moduleNumber = moduleDisplayNumber(moduleList, mod);
                    const questionCount = isStaffAssessment(activity)
                      ? activity.questionIds.length
                      : activity.questionCount;
                    const KindIcon = activity.kind === 'work' ? FileUp : ClipboardCheck;
                    const meta = [
                      subject?.name ?? 'Disciplina',
                      moduleNumber ? `Módulo ${moduleNumber}` : null,
                      activity.kind === 'work'
                        ? 'Trabalho'
                        : countLabel(questionCount, 'questão', 'questões'),
                      activity.required ? 'Obrigatória' : 'Opcional'
                    ]
                      .filter(Boolean)
                      .join(' · ');

                    return (
                      <article
                        key={activity.id}
                        className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:gap-5"
                      >
                        <DeadlineColumn
                          deadline={activity.deadline}
                          urgent={group.key === 'pending'}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <KindIcon
                              aria-hidden="true"
                              className="size-4 shrink-0 text-slate-400"
                            />
                            <Link
                              href={`/questionarios?id=${encodeURIComponent(activity.id)}`}
                              className="font-semibold text-slate-900 [overflow-wrap:anywhere] hover:text-brand-700"
                            >
                              {activity.title}
                            </Link>
                            <Badge tone={itemStatus.tone}>{itemStatus.label}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{meta}</p>
                          {activity.description && (
                            <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                              {activity.description}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <Link
                            href={`/questionarios?id=${encodeURIComponent(activity.id)}`}
                            className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          >
                            Detalhes
                          </Link>
                          {itemStatus.actionKind === 'primary' && (
                            <LinkButton href={itemStatus.actionHref}>
                              {itemStatus.actionLabel}
                            </LinkButton>
                          )}
                          {itemStatus.actionKind === 'secondary' && (
                            <LinkButton secondary href={itemStatus.actionHref}>
                              {itemStatus.actionLabel}
                            </LinkButton>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <Empty
            title="Nenhuma atividade nesta seleção"
            description="As atividades aparecerão aqui quando forem publicadas."
          />
        )}
      </>
    );
  }

  const items = sortByDeadlineAsc(
    [...scopedAssessments].sort(
      (a, b) =>
        (modules.get(a.moduleId)?.order ?? 0) - (modules.get(b.moduleId)?.order ?? 0) ||
        a.title.localeCompare(b.title, 'pt-BR')
    )
  );

  return (
    <>
      <LinkButton secondary href="/" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar ao painel
      </LinkButton>
      <PageHeading
        title="Atividades"
        action={
          canCreate && (
            <LinkButton href="/questionarios/criar">
              <Plus aria-hidden="true" className="size-4" />
              Criar atividade
            </LinkButton>
          )
        }
      />
      <ActivityTabs
        ariaLabel="Filtrar atividades"
        tabs={
          [
            { value: 'all', label: 'Todas' },
            { value: 'draft', label: 'Rascunhos' },
            { value: 'published', label: 'Publicadas' }
          ] as const
        }
        value={staffFilter}
        onChange={setStaffFilter}
        subjectFilter={subjectFilter}
        filterSubjects={filterSubjects}
        onSubjectChange={setSubjectFilter}
      />

      {items.length ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {items.map((activity) => {
            const mod = modules.get(activity.moduleId);
            const subject = mod && subjects.get(mod.subjectId);
            const moduleNumber = moduleDisplayNumber(moduleList, mod);
            const authorName = resolveActorDisplayName(activity.updatedBy, [
              ...(subject?.teachers ?? []),
              { id: user.id, name: user.name }
            ]);
            const questionCount = isStaffAssessment(activity)
              ? activity.questionIds.length
              : activity.questionCount;
            const submitted = (attempts.data ?? []).filter(
              (attempt) => attempt.assessmentId === activity.id && attempt.submittedAt
            );
            const relatedSubmissions = (submissions.data ?? []).filter(
              (submission) => submission.assessmentId === activity.id
            );
            const hasResponses =
              activity.kind === 'quiz' ? submitted.length > 0 : relatedSubmissions.length > 0;
            const KindIcon = activity.kind === 'work' ? FileUp : ClipboardCheck;
            const meta = [
              subject?.name ?? 'Disciplina',
              moduleNumber ? `Módulo ${moduleNumber}` : null,
              activity.kind === 'work'
                ? 'Trabalho'
                : countLabel(questionCount, 'questão', 'questões'),
              activity.required ? 'Obrigatória' : 'Opcional',
              `Atualizada por ${authorName}`
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <article
                key={activity.id}
                className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70 lg:flex-row lg:items-center lg:gap-5"
              >
                <DeadlineColumn
                  deadline={activity.deadline}
                  urgent={activity.status === 'published' && !!activity.deadline}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindIcon aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
                    <Link
                      href={`/questionarios?id=${encodeURIComponent(activity.id)}`}
                      className="font-semibold text-slate-900 [overflow-wrap:anywhere] hover:text-brand-700"
                    >
                      {activity.title}
                    </Link>
                    <Badge tone={activity.status === 'draft' ? 'neutral' : 'green'}>
                      {activity.status === 'draft' ? 'Rascunho' : 'Publicada'}
                    </Badge>
                    {activity.deadline && activity.allowLate && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <CalendarClock aria-hidden="true" className="size-3.5" />
                        Aceita atraso
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{meta}</p>
                  {activity.description && (
                    <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                      {activity.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Link
                    href={`/questionarios?id=${encodeURIComponent(activity.id)}`}
                    className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    Detalhes
                  </Link>
                  {activity.status === 'draft' ? (
                    <LinkButton href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}>
                      Reabrir rascunho
                    </LinkButton>
                  ) : hasResponses ? (
                    <>
                      <LinkButton
                        secondary
                        href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}
                      >
                        Editar
                      </LinkButton>
                      <LinkButton
                        href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}
                      >
                        {activity.kind === 'quiz'
                          ? `Consultar envios (${submitted.length})`
                          : `Consultar entregas (${relatedSubmissions.length})`}
                      </LinkButton>
                    </>
                  ) : (
                    <LinkButton
                      secondary
                      href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}
                    >
                      Editar atividade
                    </LinkButton>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Nenhuma atividade nesta lista"
          description="Crie um rascunho para preparar uma atividade da disciplina."
          action={
            canCreate && (
              <LinkButton href="/questionarios/criar">
                <Plus aria-hidden="true" className="size-4" />
                Criar atividade
              </LinkButton>
            )
          }
        />
      )}
    </>
  );
}
