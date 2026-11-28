'use client';

import Link from 'next/link';
import { ArrowLeft, CalendarClock, ClipboardCheck, FileUp, Plus } from 'lucide-react';
import { Badge, Empty, LinkButton, PageHeading } from '@/components/ui';
import {
  moduleDisplayNumber,
  resolveActorDisplayName,
  sortByDeadlineAsc
} from '@/lib/academic-format';
import { countLabel } from '@/lib/utils';
import type { TrailModule } from '@/models';
import {
  isStaffAssessment,
  type AssessmentRead,
  type AssessmentSubject,
  type AttemptRead,
  type SubmissionRead
} from '../api';
import { ActivityTabs, DeadlineColumn, type StaffFilter } from './assessments-list-shared';

export function AssessmentsStaffView({
  user,
  canCreate,
  scopedAssessments,
  attempts,
  submissions,
  moduleList,
  modules,
  subjects,
  staffFilter,
  onStaffFilterChange,
  subjectFilter,
  filterSubjects,
  onSubjectFilterChange
}: {
  user: { id: string; name: string };
  canCreate: boolean;
  scopedAssessments: AssessmentRead[];
  attempts: AttemptRead[];
  submissions: SubmissionRead[];
  moduleList: TrailModule[];
  modules: Map<string, TrailModule>;
  subjects: Map<string, AssessmentSubject>;
  staffFilter: StaffFilter;
  onStaffFilterChange: (next: StaffFilter) => void;
  subjectFilter: string;
  filterSubjects: { id: string; name: string }[];
  onSubjectFilterChange: (next: string) => void;
}) {
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
        onChange={onStaffFilterChange}
        subjectFilter={subjectFilter}
        filterSubjects={filterSubjects}
        onSubjectChange={onSubjectFilterChange}
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
            const submitted = attempts.filter(
              (attempt) => attempt.assessmentId === activity.id && attempt.submittedAt
            );
            const relatedSubmissions = submissions.filter(
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
