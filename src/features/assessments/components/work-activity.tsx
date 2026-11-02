'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Assessment, WorkAttachment, WorkSubmission } from '@/models';
import { useApp } from '@/providers/app-context';
import { useActivityClock } from '@/hooks/use-activity-clock';
import { useRecordRevision } from '@/hooks/use-record-revision';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { RecordConflict } from '@/components/shared/record-conflict';
import { Badge, Button, Card, Dialog, Input, LinkButton, PageHeading, Select } from '@/components/ui';
import { activityClosed, isLate, saveWork, validateAttachments } from '@/lib/activities';
import { isAssessmentAssigned } from '@/lib/enrollment';
import { removeMaterialFiles, saveMaterialFiles } from '@/lib/material-files';
import { uid } from '@/lib/utils';
import { WorkAttachments } from './work-attachments';
import { FeedbackEditor } from './feedback-editor';
import { ActivityConditions } from './activity-conditions';

function PublishedFeedback({ activity, submission }: { activity: Assessment; submission: WorkSubmission }) {
  const { db } = useApp();
  const f = submission.feedbackPublished;
  return <Card className="mt-5"><h2 className="font-semibold">{f ? 'Feedback disponível' : 'Entregue — aguardando feedback'}</h2>{f && <><p className="mt-3 text-xs text-slate-500">{submission.feedbackHistory.length > 1 || submission.feedbackUpdated ? 'Atualizado · ' : ''}{db.users.find(u => u.id === f.authorId)?.name ?? 'Equipe'} · {new Date(f.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-7">{f.comment}</p><p className="mt-3 text-sm font-semibold">{f.grade === undefined ? 'Sem nota' : `Nota: ${f.grade} / ${activity.maxGrade}`}</p></>}</Card>;
}

export function WorkActivity({ activity }: { activity: Assessment }) {
  const { db, user, role } = useApp();
  const params = useSearchParams();
  const [filter, setFilter] = useState('all');
  const submissions = (db.submissions ?? []).filter(s => s.assessmentId === activity.id && s.submittedAt);
  const selected = submissions.find(s => s.id === params.get('entrega'));
  const subject = db.subjects.find(s => s.id === db.modules.find(m => m.id === activity.moduleId)?.subjectId);
  const students = db.users.filter(u => u.role === 'student' && (db.classes.find(c => c.id === subject?.classId)?.studentIds.includes(u.id) || submissions.some(s => s.userId === u.id)));
  return <>
    <PageHeading eyebrow={role === 'student' ? 'Entrega de trabalho' : 'Acompanhamento individual'} title={activity.title} description={activity.description} action={role !== 'student' && <LinkButton secondary href={`/questionarios/criar?id=${activity.id}`}>Editar atividade</LinkButton>} />
    <ActivityConditions activity={activity} />
    {role === 'student' ? <WorkStudent key={`${activity.id}:${user.id}`} activity={activity} /> : <>
      <Card><h2 className="mb-4 font-semibold">Alunos e entregas</h2><Select label="Filtrar situação" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos</option><option value="missing">Não entregue</option><option value="waiting">Aguardando feedback</option><option value="feedback">Feedback disponível</option><option value="unassigned">Não atribuída</option></Select>
        <ul className="mt-4 divide-y divide-slate-200">{students.map(student => {
          const submission = submissions.find(s => s.userId === student.id);
          const assigned = isAssessmentAssigned(db, activity, student.id);
          const state = submission ? submission.feedbackPublished ? 'feedback' : 'waiting' : assigned ? 'missing' : 'unassigned';
          if (filter !== 'all' && filter !== state) return null;
          return <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"><span>{student.name}<span className="mt-1 block text-xs text-slate-500">{submission ? submission.feedbackPublished ? 'Feedback disponível' : 'Entregue — aguardando feedback' : !assigned ? 'Não atribuída — vínculo encerrado ou matrícula posterior ao prazo' : activity.required === false ? 'Opcional — sem envio' : 'Não entregue'}</span></span>{submission && <LinkButton secondary href={`/questionarios/responder?id=${activity.id}&entrega=${submission.id}`}>Consultar entrega de {student.name}</LinkButton>}</li>;
        })}</ul>{!students.length && <p className="py-4 text-sm text-slate-500">Nenhum aluno neste contexto.</p>}
      </Card>
      {selected && <><Card className="mt-5"><h2 className="font-semibold">Entrega de {db.users.find(u => u.id === selected.userId)?.name ?? 'Aluno'}</h2><p className="mt-3 text-sm">{new Date(selected.submittedAt!).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{isLate(activity, selected.submittedAt!) && ' · Entregue com atraso'}</p><WorkAttachments items={selected.attachments} /></Card><PublishedFeedback activity={activity} submission={selected} /><FeedbackEditor key={selected.id} activity={activity} submission={selected} /></>}
      {params.get('entrega') && !selected && <p role="status" className="mt-5 text-sm">Entrega indisponível neste contexto.</p>}
    </>}
    <div className="mt-6 flex flex-wrap gap-3"><LinkButton secondary href="/questionarios">Ver atividades</LinkButton><LinkButton secondary href={`/disciplinas/detalhes?id=${subject?.id}&aba=materiais`}>Voltar à disciplina</LinkButton></div>
  </>;
}

function WorkStudent({ activity }: { activity: Assessment }) {
  const { db, user, mutate, busy } = useApp();
  const now = useActivityClock();
  const submission = db.submissions?.find(s => s.assessmentId === activity.id && s.userId === user.id);
  const [id] = useState(submission?.id ?? uid('delivery'));
  const [items, setItems] = useState<WorkAttachment[]>(submission?.attachments ?? []);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const revision = useRecordRevision('submissions', submission);
  const closed = activityClosed(activity, now);
  useUnsavedChanges((dirty || !!url.trim()) && !submission?.submittedAt);
  const append = (next: WorkAttachment[]) => {
    try { validateAttachments([...items, ...next]); setItems(old => [...old, ...next]); setDirty(true); setError(''); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Confira os anexos.'); return false; }
  };
  const save = async (submit: boolean) => {
    if (saving || busy || revision.conflict) return;
    setSaving(true); setError('');
    const fresh = Object.entries(files).filter(([key]) => items.some(a => a.id === key));
    try {
      if (fresh.length) await saveMaterialFiles(fresh.map(([key, file]) => ({ id: key, file })));
      const ok = await mutate(d => saveWork(d, activity.id, user.id, id, items, submit, new Date().toISOString()), submit ? 'Trabalho enviado. Consulte o comprovante.' : 'Rascunho salvo. Você ainda não enviou o trabalho.', { ...revision.expected, requirePersistence: true });
      if (!ok) { if (fresh.length) await removeMaterialFiles(fresh.map(([key]) => key)); return; }
      setFiles({}); setDirty(false); setConfirm(false);
      revision.capture({ id: submission?.id ?? id, revision: (submission?.revision ?? 0) + 1 });
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível gravar os anexos.'); }
    finally { setSaving(false); }
  };
  if (!isAssessmentAssigned(db, activity, user.id)) return <Card><p role="status" className="text-sm leading-7">Somente consulta — prazo anterior à sua matrícula. Esta atividade não foi atribuída a você e não gera pendência nem entrega atrasada.</p></Card>;
  if (submission?.submittedAt) return <><Card><Badge tone="green">Entregue</Badge><h2 className="mt-4 font-semibold">Comprovante de entrega</h2><p className="mt-3 text-sm">{activity.title} · {new Date(submission.submittedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília)</p><p className="mt-2 text-sm">{submission.attachments.length} anexos · {isLate(activity, submission.submittedAt) ? 'Entregue com atraso' : 'Entrega registrada'}</p><p className="mt-3 text-sm text-slate-500">Envio único confirmado. Os anexos não podem ser substituídos.</p><WorkAttachments items={submission.attachments} /></Card><PublishedFeedback activity={activity} submission={submission} /></>;
  return <Card className="space-y-4">
    <h2 className="font-semibold">Preparar entrega</h2><p className="text-sm leading-7 text-slate-600">Até 5 anexos no total, contando arquivos e links, e até 10 MB por arquivo. Formatos livres. Salve o rascunho para retomar após recarregar; preparar anexos não equivale a enviar.</p>
    {closed ? <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Prazo encerrado. O envio está bloqueado; seu rascunho foi preservado. Você pode salvá-lo e aguardar orientação da equipe.</p> : isLate(activity, now) && <p role="status" className="text-sm text-amber-800">A entrega será registrada com atraso.</p>}
    {revision.conflict && submission && <RecordConflict key={submission.revision} author="sua conta em outra aba" updatedAt={submission.updatedAt} onReviewed={revision.acknowledge}><p>Anexos atuais: {submission.attachments.map(a => a.name).join(', ')}</p></RecordConflict>}
    <Input label="Adicionar arquivos" type="file" multiple disabled={saving || busy} onChange={e => {
      const selected = Array.from(e.target.files ?? []);
      const additions = selected.map(file => ({ id: uid('work-file'), kind: 'file' as const, name: file.name, mime: file.type, size: file.size }));
      if (append(additions)) setFiles(old => ({ ...old, ...Object.fromEntries(additions.map((a, i) => [a.id, selected[i]])) }));
      e.target.value = '';
    }} />
    <Input label="Link do trabalho" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" />
    <Button variant="secondary" disabled={!url.trim() || saving || busy} onClick={() => { if (append([{ id: uid('work-link'), kind: 'link', name: 'Link do trabalho', url: url.trim() }])) setUrl(''); }}>Adicionar link</Button>
    <WorkAttachments items={items} files={files} onRemove={saving || busy ? undefined : key => { setItems(old => old.filter(a => a.id !== key)); setDirty(true); }} />
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <p role="status" className="text-xs text-slate-500">{dirty ? 'Alterações ainda não salvas.' : submission ? 'Rascunho salvo — não entregue.' : 'Não entregue.'}</p>
    <div className="flex flex-wrap gap-3"><Button variant="secondary" loading={saving || busy} disabled={revision.conflict} onClick={() => void save(false)}>Salvar rascunho</Button><Button disabled={closed || !items.length || saving || busy || revision.conflict} onClick={() => setConfirm(true)}>Conferir e enviar</Button></div>
    <Dialog open={confirm} onClose={() => setConfirm(false)} title="Confirmar entrega única">
      <p className="text-sm leading-7">Enviar estes {items.length} anexos para {activity.title}? Após o envio, você poderá consultar a entrega, mas não substituir os arquivos nem realizar novo envio.</p><WorkAttachments items={items} files={files} />
      {closed && <p role="alert" className="text-sm text-rose-700">Prazo encerrado. O envio foi bloqueado e os anexos foram preservados.</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-3"><Button variant="secondary" onClick={() => setConfirm(false)}>Voltar à preparação</Button><Button loading={saving || busy} disabled={closed || revision.conflict} onClick={() => void save(true)}>Confirmar envio único</Button></div>
    </Dialog>
  </Card>;
}
