'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClipboardCheck, Plus } from 'lucide-react';
import { Badge, Button, Card, Empty, ErrorState, LinkButton, PageHeading, Skeleton } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { createAssessmentsApi, type AssessmentRead, type AssessmentStaff, type AttemptRead, type SubmissionRead } from '../api';

type Filter = 'all' | 'draft' | 'published';

function isStaffAssessment(activity: AssessmentRead): activity is AssessmentStaff {
  return 'questionIds' in activity;
}

function dateLabel(value: string | null) {
  if (!value) return 'Sem prazo';
  return `Até ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))} (Brasília)`;
}

function ActivityDetails({ activity, canManage, userId, attempts, submissions }: { activity: AssessmentRead; canManage: boolean; userId: string; attempts: AttemptRead[]; submissions: SubmissionRead[] }) {
  const staff = isStaffAssessment(activity);
  const questionCount = staff ? activity.questionIds.length : activity.questionCount;
  const related = attempts.filter(attempt => attempt.assessmentId === activity.id && (canManage || attempt.userId === userId));
  const activeAttempt = related.find(attempt => !attempt.submittedAt);
  const submitted = related.filter(attempt => attempt.submittedAt);
  const workSubmissions = submissions.filter(submission => submission.assessmentId === activity.id && (canManage || submission.userId === userId));
  const ownWork = workSubmissions.find(submission => !canManage) ?? workSubmissions[0];
  return <>
    <LinkButton secondary href="/questionarios">Voltar para atividades</LinkButton>
    <Card className="mt-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone={activity.status === 'draft' ? 'neutral' : 'green'}>{activity.status === 'draft' ? 'Rascunho' : 'Publicada'}</Badge><Badge>{activity.kind === 'work' ? 'Entrega de trabalho' : 'Questionário'}</Badge><Badge>{activity.required ? 'Obrigatória' : 'Opcional'}</Badge></div>
          <h2 className="text-xl font-semibold">{activity.title}</h2>
        </div>
        {canManage && <LinkButton href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}>Editar atividade</LinkButton>}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{activity.description || 'Sem orientações adicionais.'}</p>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-slate-800">Prazo</dt><dd className="mt-1 text-slate-600">{dateLabel(activity.deadline)}</dd></div>
        {activity.deadline && <div><dt className="font-semibold text-slate-800">Envios atrasados</dt><dd className="mt-1 text-slate-600">{activity.allowLate ? 'Aceitos' : 'Não aceitos'}</dd></div>}
        <div><dt className="font-semibold text-slate-800">Composição</dt><dd className="mt-1 text-slate-600">{activity.kind === 'work' ? 'Entrega de trabalho' : `${questionCount} ${questionCount === 1 ? 'questão' : 'questões'}`}</dd></div>
        {activity.kind === 'work' && activity.maxGrade !== null && <div><dt className="font-semibold text-slate-800">Nota máxima</dt><dd className="mt-1 text-slate-600">{activity.maxGrade}</dd></div>}
      </dl>
      {staff && <section className="border-t border-slate-100 pt-4">
        <h3 className="font-semibold">Questões incluídas</h3>
        {activity.questions.length ? <ol className="mt-3 list-decimal space-y-3 pl-5">{activity.questions.map(question => <li key={question.id} className="text-sm leading-6 text-slate-700">{question.statement}<span className="ml-2 text-xs text-slate-500">{question.origin === 'author' ? 'Autoral desta atividade' : 'Cópia do acervo'}</span></li>)}</ol> : <p className="mt-2 text-sm text-slate-500">Este trabalho recebe arquivos e links.</p>}
      </section>}
      {activity.kind === 'quiz' && <section className="border-t border-slate-100 pt-4">
        <h3 className="font-semibold">Tentativa</h3>
        {canManage ? submitted.length ? <LinkButton className="mt-3" href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>Consultar envios entregues</LinkButton> : <p className="mt-2 text-sm text-slate-500">Ainda não há envios para consulta.</p>
          : activity.status !== 'published' ? <p className="mt-2 text-sm text-slate-500">Este rascunho não está disponível para resposta.</p>
            : !('assigned' in activity) || !activity.assigned ? <p className="mt-2 text-sm text-slate-500">Disponível apenas para consulta; esta atividade não foi atribuída à sua matrícula.</p>
              : submitted.length ? <LinkButton className="mt-3" href={`/questionarios/resultado?id=${encodeURIComponent(submitted[0].id)}`}>Ver resultado</LinkButton>
                : <LinkButton className="mt-3" href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>{activeAttempt ? 'Retomar questionário' : 'Iniciar questionário'}</LinkButton>}
      </section>}
      {activity.kind === 'work' && <section className="border-t border-slate-100 pt-4"><h3 className="font-semibold">Entrega de trabalho</h3>{canManage
        ? <><p className="mt-2 text-sm text-slate-600">{workSubmissions.length} entrega(s) concluída(s). Rascunhos dos alunos permanecem privados.</p>{workSubmissions.length > 0 && <LinkButton className="mt-3" href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>Consultar entregas</LinkButton>}</>
        : !('assigned' in activity) || !activity.assigned
          ? <p role="status" className="mt-2 text-sm text-slate-600">Disponível apenas para consulta; esta atividade não foi atribuída à sua matrícula.</p>
          : ownWork?.submittedAt
            ? <LinkButton className="mt-3" href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}&entrega=${encodeURIComponent(ownWork.id)}`}>Consultar comprovante e feedback</LinkButton>
            : <LinkButton className="mt-3" href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>{ownWork ? 'Retomar rascunho' : 'Preparar entrega'}</LinkButton>}</section>}
    </Card>
  </>;
}

export function AssessmentsPage() {
  const { client, sessionKey, resourceEpoch, status, user } = useSession();
  const params = useSearchParams();
  const detailId = params.get('id');
  const [filter, setFilter] = useState<Filter>('all');
  const api = useMemo(() => createAssessmentsApi(client), [client]);
  const query = useHttpQuery({ sessionKey, key: JSON.stringify(['assessments', filter, resourceEpoch]) }, useCallback(signal => api.overview(filter === 'all' ? {} : { status: filter }, signal, sessionKey), [api, filter, sessionKey]), status === 'authenticated');
  const detail = useHttpQuery({ sessionKey, key: `assessment-detail:${detailId ?? ''}:${resourceEpoch}` }, useCallback(signal => api.read(detailId ?? '', signal), [api, detailId]), status === 'authenticated' && !!detailId);
  const attempts = useHttpQuery({ sessionKey, key: `assessment-attempts:${resourceEpoch}` }, useCallback(signal => api.allAttempts({}, signal, sessionKey), [api, sessionKey]), status === 'authenticated');
  const submissions = useHttpQuery({ sessionKey, key: `assessment-submissions:${resourceEpoch}` }, useCallback(signal => api.allSubmissions({}, signal, sessionKey), [api, sessionKey]), status === 'authenticated');

  if (status === 'loading') return <Skeleton />;
  if (status !== 'authenticated' || !user) return <Empty title="Entre para consultar atividades" description="As atividades da disciplina aparecem para a conta autenticada." />;
  if (detailId) {
    if (detail.loading) return <Skeleton />;
    if (detail.error) return <ErrorState message={detail.error.message} retry={() => void detail.retry()} />;
    if (!detail.data) return <Empty title="Atividade indisponível" action={<LinkButton href="/questionarios">Voltar para atividades</LinkButton>} />;
    if (detail.data.kind === 'work' && submissions.loading) return <Skeleton />;
    if (detail.data.kind === 'work' && submissions.error) return <ErrorState message={submissions.error.message} retry={() => void submissions.retry()} />;
    if (attempts.loading) return <Skeleton />;
    if (attempts.error) return <ErrorState message={attempts.error.message} retry={() => void attempts.retry()} />;
    return <ActivityDetails activity={detail.data} canManage={user.role !== 'student'} userId={user.id} attempts={attempts.data ?? []} submissions={submissions.data ?? []} />;
  }
  if (query.loading) return <Skeleton />;
  if (query.error) return <ErrorState message={query.error.message} retry={() => void query.retry()} />;
  if (attempts.loading) return <Skeleton />;
  if (attempts.error) return <ErrorState message={attempts.error.message} retry={() => void attempts.retry()} />;
  if (submissions.loading) return <Skeleton />;
  if (submissions.error) return <ErrorState message={submissions.error.message} retry={() => void submissions.retry()} />;

  const modules = new Map((query.data?.modules ?? []).map(module => [module.id, module]));
  const subjects = new Map((query.data?.subjects ?? []).map(subject => [subject.id, subject]));
  const staff = user.role !== 'student';
  const canCreate = staff && (query.data?.modules ?? []).some(module => subjects.get(module.subjectId)?.canManageContent);
  const items = [...(query.data?.assessments ?? [])].sort((a, b) => (modules.get(a.moduleId)?.order ?? 0) - (modules.get(b.moduleId)?.order ?? 0) || a.title.localeCompare(b.title, 'pt-BR'));
  return <>
    <PageHeading title="Atividades" description="Consulte as atividades publicadas e, para a equipe docente, prepare ou atualize os rascunhos." action={canCreate && <LinkButton href="/questionarios/criar"><Plus aria-hidden="true" className="size-4" />Criar atividade</LinkButton>} />
    {staff && <div role="group" aria-label="Filtrar atividades" className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {([['all', 'Todas'], ['draft', 'Rascunhos'], ['published', 'Publicadas']] as const).map(([value, label]) => <Button key={value} variant="ghost" aria-pressed={filter === value} className={filter === value ? 'bg-brand-100 !text-brand-700' : undefined} onClick={() => setFilter(value)}>{label}</Button>)}
    </div>}
    {items.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map(activity => {
      const module = modules.get(activity.moduleId);
      const subject = module && subjects.get(module.subjectId);
      const own = isStaffAssessment(activity);
      const count = own ? activity.questionIds.length : activity.questionCount;
      const assigned = isStaffAssessment(activity) ? true : activity.assigned;
      const related = (attempts.data ?? []).filter(attempt => attempt.assessmentId === activity.id && (staff || attempt.userId === user.id));
      const activeAttempt = related.find(attempt => !attempt.submittedAt);
      const submitted = related.filter(attempt => attempt.submittedAt);
      const relatedSubmissions = (submissions.data ?? []).filter(submission => submission.assessmentId === activity.id && (staff || submission.userId === user.id));
      const ownSubmission = relatedSubmissions.find(submission => !staff) ?? relatedSubmissions[0];
      return <Card key={activity.id} className="flex flex-col">
        <div className="mb-4 flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs text-slate-500"><ClipboardCheck aria-hidden="true" className="size-5" />{activity.kind === 'work' ? 'Entrega de trabalho' : 'Questionário'}</span><Badge tone={activity.status === 'draft' ? 'neutral' : 'green'}>{activity.status === 'draft' ? 'Rascunho' : !assigned ? 'Somente consulta' : 'Publicada'}</Badge></div>
        <p className="text-xs text-slate-400">{subject?.name ?? 'Disciplina'} · Módulo {module?.order ?? '—'}</p>
        <h2 className="mb-2 mt-2 text-lg font-semibold">{activity.title}</h2>
        <p className="mb-5 flex-1 whitespace-pre-wrap text-sm leading-6 text-slate-500">{activity.description || 'Sem orientações adicionais.'}</p>
        <div className="mb-5 space-y-2 text-sm text-slate-500">
          <p>{activity.kind === 'work' ? 'Entrega de trabalho' : `${count} ${count === 1 ? 'questão' : 'questões'}`} · {activity.required ? 'Obrigatória' : 'Opcional'}</p>
          <p>{dateLabel(activity.deadline)}{activity.deadline && ` · ${activity.allowLate ? 'Aceita atraso' : 'Não aceita atraso'}`}</p>
          <p>{staff ? `Atualizada por ${activity.updatedBy}` : assigned ? 'Atribuída à sua matrícula' : 'Publicada antes da sua matrícula'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton secondary href={`/questionarios?id=${encodeURIComponent(activity.id)}`}>Detalhes</LinkButton>
          {activity.kind === 'quiz' && !staff && assigned && (submitted[0]
            ? <LinkButton href={`/questionarios/resultado?id=${encodeURIComponent(submitted[0].id)}`}>Ver resultado</LinkButton>
            : <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>{activeAttempt ? 'Retomar' : 'Iniciar'}</LinkButton>)}
          {activity.kind === 'quiz' && staff && submitted.length > 0 && <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>Consultar envios</LinkButton>}
          {activity.kind === 'work' && staff && relatedSubmissions.length > 0 && <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>Consultar entregas ({relatedSubmissions.length})</LinkButton>}
          {activity.kind === 'work' && !staff && assigned && (ownSubmission
            ? <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}${ownSubmission.submittedAt ? `&entrega=${encodeURIComponent(ownSubmission.id)}` : ''}`}>{ownSubmission.submittedAt ? 'Consultar comprovante' : 'Retomar rascunho'}</LinkButton>
            : <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>Preparar entrega</LinkButton>)}
          {staff && <LinkButton href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}>{activity.status === 'draft' ? 'Reabrir rascunho' : 'Editar atividade'}</LinkButton>}
        </div>
      </Card>;
    })}</div> : <Empty title="Nenhuma atividade nesta lista" description={staff ? 'Crie um rascunho para preparar uma atividade da disciplina.' : 'As atividades aparecerão aqui quando forem publicadas.'} action={canCreate && <LinkButton href="/questionarios/criar"><Plus aria-hidden="true" className="size-4" />Criar atividade</LinkButton>} />}
  </>;
}
