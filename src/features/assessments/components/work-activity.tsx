'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Empty, ErrorState, LinkButton, PageHeading, Skeleton } from '@/components/ui';
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
    return (
      <>
        <LinkButton secondary href="/questionarios" className="mb-5">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Voltar para atividades
        </LinkButton>
        <PageHeading title={activity.title} description={activity.description} />
        <ActivityConditions activity={activity} />
        <WorkStudentView
          key={`${activity.id}:${user.id}`}
          activity={activity}
          initialSubmission={own && isStudentSubmission(own) ? own : null}
          userId={user.id}
          sessionId={sessionId ?? ''}
        />
      </>
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
