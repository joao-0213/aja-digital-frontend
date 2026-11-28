'use client';

import Link from 'next/link';
import { ArrowLeft, ClipboardCheck, FileUp } from 'lucide-react';
import { Badge, Empty, LinkButton, PageHeading } from '@/components/ui';
import { moduleDisplayNumber } from '@/lib/academic-format';
import { countLabel } from '@/lib/utils';
import type { TrailModule } from '@/models';
import {
  isStaffAssessment,
  type AssessmentRead,
  type AssessmentSubject,
  type AttemptRead,
  type SubmissionRead
} from '../api';
import { groupStudentActivities } from '../lib/activity-list';
import { ActivityTabs, DeadlineColumn, type StudentFilter } from './assessments-list-shared';

export function AssessmentsStudentView({
  userId,
  scopedAssessments,
  attempts,
  submissions,
  moduleList,
  modules,
  subjects,
  studentFilter,
  onStudentFilterChange,
  subjectFilter,
  filterSubjects,
  onSubjectFilterChange
}: {
  userId: string;
  scopedAssessments: AssessmentRead[];
  attempts: AttemptRead[];
  submissions: SubmissionRead[];
  moduleList: TrailModule[];
  modules: Map<string, TrailModule>;
  subjects: Map<string, AssessmentSubject>;
  studentFilter: StudentFilter;
  onStudentFilterChange: (next: StudentFilter) => void;
  subjectFilter: string;
  filterSubjects: { id: string; name: string }[];
  onSubjectFilterChange: (next: string) => void;
}) {
  const allGroups = groupStudentActivities(scopedAssessments, userId, attempts, submissions);
  const pendingCount = allGroups.find((group) => group.key === 'pending')?.entries.length ?? 0;
  const completedCount =
    (allGroups.find((group) => group.key === 'completed')?.entries.length ?? 0) +
    (allGroups.find((group) => group.key === 'awaiting_feedback')?.entries.length ?? 0);
  const visibleGroups = allGroups.filter((group) =>
    studentFilter === 'pending'
      ? group.key === 'pending'
      : group.key === 'completed' || group.key === 'awaiting_feedback'
  );

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
            { value: 'pending', label: 'Pendentes', count: pendingCount },
            { value: 'completed', label: 'Concluídas', count: completedCount }
          ] as const
        }
        value={studentFilter}
        onChange={onStudentFilterChange}
        subjectFilter={subjectFilter}
        filterSubjects={filterSubjects}
        onSubjectChange={onSubjectFilterChange}
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
                          <KindIcon aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
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
          title={
            studentFilter === 'pending'
              ? 'Nenhuma atividade pendente'
              : 'Nenhuma atividade concluída'
          }
          description={
            studentFilter === 'pending'
              ? 'Você está em dia com as atividades publicadas.'
              : 'As atividades entregues ou avaliadas aparecerão aqui.'
          }
        />
      )}
    </>
  );
}
