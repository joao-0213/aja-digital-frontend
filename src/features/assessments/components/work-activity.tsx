'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, FileUp } from 'lucide-react';
import { Empty, ErrorState, LinkButton, Skeleton } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { isStaffSubmission, isStudentSubmission, type AssessmentRead } from '../api';
import { useAssessmentsApi } from '../hooks/use-assessments';
import { ActivityConditions } from './activity-conditions';
import { WorkStaffView } from './work-staff-view';
import { WorkStudentView } from './work-student-view';

export function WorkActivity({ activity }: { activity: AssessmentRead }) {
  const { sessionKey, status, user, sessionId } = useSession();
  const params = useSearchParams();
  const selectedId = params.get('entrega');
  const api = useAssessmentsApi();
  const submissions = useHttpQuery(
    { sessionKey, key: ['assessments', 'work-submissions', activity.id] },
    useCallback(
      (signal) => api.allSubmissions({ assessmentId: activity.id }, signal, sessionKey),
      [activity.id, api, sessionKey]
    ),
    status === 'authenticated'
  );
  const roster = useHttpQuery(
    { sessionKey, key: ['assessments', 'work-roster', activity.moduleId] },
    useCallback(
      (signal) => api.rosterForModule(activity.moduleId, signal, sessionKey),
      [activity.moduleId, api, sessionKey]
    ),
    status === 'authenticated' && !!user && user.role !== 'student'
  );

  if (status === 'loading') return <Skeleton />;
  if (status !== 'authenticated' || !user)
    return <Empty title="Entre para acessar esta atividade" />;
  if (submissions.loading) return <Skeleton />;
  if (submissions.error)
    return (
      <ErrorState message={submissions.error.message} retry={() => void submissions.retry()} />
    );

  const rows = submissions.data ?? [];
  if (user.role === 'student') {
    const own = rows.find((row) => row.userId === user.id);
    const studentSubmission = own && isStudentSubmission(own) ? own : null;
    return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <LinkButton secondary href="/questionarios">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Voltar para atividades
          </LinkButton>
          <LinkButton secondary href={`/questionarios?id=${encodeURIComponent(activity.id)}`}>
            Detalhes da atividade
          </LinkButton>
        </div>

        <header className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="relative flex flex-wrap items-start justify-between gap-4 bg-brand-50/75 px-5 py-6 text-brand-700 sm:px-7 sm:py-7">
            <div className="relative z-10 flex min-w-0 flex-1 items-start gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-brand-600 shadow-xs ring-1 ring-black/5">
                <FileUp aria-hidden="true" className="size-7" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold tracking-wide text-brand-700">
                  {studentSubmission?.submittedAt
                    ? 'Comprovante de entrega'
                    : 'Entrega de trabalho'}
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">
                  {activity.title}
                </h1>
                {activity.description && (
                  <p className="mt-1.5 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">
                    {activity.description}
                  </p>
                )}
              </div>
            </div>
            <FileUp
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-6 right-6 hidden size-36 text-white sm:block"
              strokeWidth={1.2}
            />
          </div>
          <div className="border-t border-slate-100 bg-white px-5 py-3.5 sm:px-7">
            <ActivityConditions activity={activity} embedded />
          </div>
        </header>

        <WorkStudentView
          key={`${activity.id}:${user.id}`}
          activity={activity}
          initialSubmission={studentSubmission}
          userId={user.id}
          sessionId={sessionId ?? ''}
        />
      </div>
    );
  }

  const filtered = rows.filter(isStaffSubmission);
  const selected = filtered.find((row) => row.id === selectedId);
  const submittedUserIds = new Set(filtered.map((item) => item.userId));
  const pendingStudents = (roster.data ?? []).filter(
    (student) => !submittedUserIds.has(student.id)
  );

  return (
    <WorkStaffView
      activity={activity}
      filtered={filtered}
      selected={selected}
      selectedId={selectedId}
      pendingStudents={pendingStudents}
      onPublished={() => {
        void submissions.invalidate();
      }}
    />
  );
}
