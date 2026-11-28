'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Empty, ErrorState, LinkButton, Skeleton } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { assessmentKeys, useAssessmentsApi } from '../hooks/use-assessments';
import { ActivityDetails } from './activity-details';
import type { StaffFilter, StudentFilter } from './assessments-list-shared';
import { AssessmentsStaffView } from './assessments-staff-view';
import { AssessmentsStudentView } from './assessments-student-view';

export function AssessmentsPage() {
  const { sessionKey, status, user } = useSession();
  const params = useSearchParams();
  const detailId = params.get('id');
  const [staffFilter, setStaffFilter] = useState<StaffFilter>('all');
  const [studentFilter, setStudentFilter] = useState<StudentFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const api = useAssessmentsApi();

  const query = useHttpQuery(
    { sessionKey, key: assessmentKeys.list(staffFilter) },
    useCallback(
      (signal) =>
        api.overview(staffFilter === 'all' ? {} : { status: staffFilter }, signal, sessionKey),
      [api, staffFilter, sessionKey]
    ),
    { enabled: status === 'authenticated', keepPreviousData: true }
  );
  const detail = useHttpQuery(
    { sessionKey, key: ['assessments', 'detail', detailId ?? ''] },
    useCallback((signal) => api.read(detailId ?? '', signal), [api, detailId]),
    status === 'authenticated' && !!detailId
  );
  const attempts = useHttpQuery(
    { sessionKey, key: ['assessments', 'attempts'] },
    useCallback((signal) => api.allAttempts({}, signal, sessionKey), [api, sessionKey]),
    status === 'authenticated'
  );
  const submissions = useHttpQuery(
    { sessionKey, key: ['assessments', 'submissions'] },
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
    return (
      <AssessmentsStudentView
        userId={user.id}
        scopedAssessments={scopedAssessments}
        attempts={attempts.data ?? []}
        submissions={submissions.data ?? []}
        moduleList={moduleList}
        modules={modules}
        subjects={subjects}
        studentFilter={studentFilter}
        onStudentFilterChange={setStudentFilter}
        subjectFilter={subjectFilter}
        filterSubjects={filterSubjects}
        onSubjectFilterChange={setSubjectFilter}
      />
    );
  }

  return (
    <AssessmentsStaffView
      user={user}
      canCreate={canCreate}
      scopedAssessments={scopedAssessments}
      attempts={attempts.data ?? []}
      submissions={submissions.data ?? []}
      moduleList={moduleList}
      modules={modules}
      subjects={subjects}
      staffFilter={staffFilter}
      onStaffFilterChange={setStaffFilter}
      subjectFilter={subjectFilter}
      filterSubjects={filterSubjects}
      onSubjectFilterChange={setSubjectFilter}
    />
  );
}
