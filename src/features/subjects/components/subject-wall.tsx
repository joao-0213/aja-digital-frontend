'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, BookOpen, FileText, Upload } from 'lucide-react';
import { PublicationDate } from '@/components/ui/publication-date';
import { useApp } from '@/providers/app-context';
import { Avatar, Button, Dialog, Empty, Input, Select, Textarea } from '@/components/ui';
import { dateLabel, uid } from '@/lib/utils';
import { DEMO_DATE } from '@/mocks/database';

export function SubjectWall({ subjectId, canEdit, onUpload }: { subjectId: string; canEdit: boolean; onUpload: (moduleId: string) => void }) {
  const { db, user, mutate, busy } = useApp();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [choosingModule, setChoosingModule] = useState(false);
  const [moduleId, setModuleId] = useState('');
  const [filter, setFilter] = useState('all');
  const subject = db.subjects.find(s => s.id === subjectId)!;
  const modules = db.modules.filter(m => m.subjectId === subjectId).sort((a, b) => a.order - b.order);
  const materials = db.materials.filter(m => modules.some(mod => mod.id === m.moduleId));
  const notices = db.announcements.filter(a => a.classId === subject.classId && (!a.subjectId || a.subjectId === subjectId));
  const entries = [
    ...notices.map(a => ({ key: `notice-${a.id}`, kind: 'notice' as const, title: a.title, body: a.body, date: a.createdAt, author: a.authorId, detail: a.subjectId ? 'Aviso da disciplina' : 'Aviso da turma', href: '', moduleId: '', fileLabel: '' })),
    ...materials.map(m => ({ key: `material-${m.id}`, kind: 'material' as const, title: m.title, body: m.content, date: m.createdAt ?? '', author: m.authorId ?? subject.teacherId, detail: modules.find(mod => mod.id === m.moduleId)!.title, href: `/materiais?id=${m.id}`, moduleId: m.moduleId, fileLabel: m.fileName ?? (m.kind === 'pdf' ? 'Documento PDF' : m.kind === 'video' ? 'Vídeo de apoio' : 'Texto de apoio') }))
  ].filter(item => filter === 'all' || item.kind === filter).sort((a, b) => b.date.localeCompare(a.date));
  const deadlines = db.assessments.filter(a => a.status === 'published' && modules.some(m => m.id === a.moduleId) && a.deadline >= `${DEMO_DATE}T00:00` && (canEdit || !db.attempts.some(t => t.assessmentId === a.id && t.userId === user.id && t.submittedAt))).sort((a, b) => a.deadline.localeCompare(b.deadline));

  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_240px]">
    <section aria-label="Publicações da disciplina" className="min-w-0 space-y-4">
      {canEdit && <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap gap-2"><Button onClick={() => setComposing(!composing)} aria-expanded={composing}><Bell aria-hidden="true" className="size-4" />Publicar aviso</Button><Button variant="secondary" onClick={() => setChoosingModule(true)}><Upload aria-hidden="true" className="size-4" />Enviar materiais</Button></div>
        {composing && <form className="mt-5 space-y-4 border-t border-slate-100 pt-5" onSubmit={async event => {
          event.preventDefault();
          if (!title.trim() || !body.trim()) return;
          const ok = await mutate(d => { d.announcements.unshift({ id: uid('notice'), classId: subject.classId, subjectId, authorId: user.id, title: title.trim(), body: body.trim(), createdAt: new Date().toISOString(), notify: true }); }, 'Aviso publicado.');
          if (ok) { setTitle(''); setBody(''); setComposing(false); setFilter('all'); }
        }}><Input label="Título do aviso" value={title} onChange={e => setTitle(e.target.value)} required maxLength={150} disabled={busy} /><Textarea label="Mensagem" value={body} onChange={e => setBody(e.target.value)} required disabled={busy} /><div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setComposing(false)}>Cancelar</Button><Button type="submit" loading={busy}>Publicar</Button></div></form>}
      </div>}
      <div className="flex flex-wrap items-center gap-2" aria-label="Filtrar publicações">{[{ value: 'all', label: 'Tudo' }, { value: 'notice', label: 'Avisos' }, { value: 'material', label: 'Materiais' }].map(item => <Button key={item.value} variant={filter === item.value ? 'secondary' : 'ghost'} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</Button>)}</div>
      {entries.map(item => {
        const author = db.users.find(u => u.id === item.author);
        return <article key={item.key} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3"><Avatar name={author?.name ?? 'Equipe AJA'} src={author?.avatar} size="sm" /><div className="min-w-0"><p className="text-sm font-semibold">{author?.name ?? 'Equipe AJA'}</p><p className="mt-1 text-xs text-slate-500">{item.kind === 'notice' ? item.detail : 'Material da disciplina'}{!item.date && <> · <PublicationDate /></>}{item.date && <> · <time dateTime={item.date}>{dateLabel(item.date)} · {new Date(item.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></>}</p></div></div>
          <h2 className="text-lg font-semibold">{item.title}</h2>
          {item.body && <p className={`mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 ${item.kind === 'material' ? 'line-clamp-3' : ''}`}>{item.body}</p>}
          {item.kind === 'material' && <>
            <Link href={item.href} className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 p-4 hover:border-brand-200 hover:bg-brand-50"><FileText aria-hidden="true" className="size-5 shrink-0 text-brand-700" /><div className="min-w-0"><p className="break-words text-sm font-semibold text-brand-900">{item.fileLabel}</p><p className="mt-1 text-xs text-slate-500">Abrir material</p></div></Link>
            <Link href={`/disciplinas/detalhes?id=${subjectId}&aba=materiais#module-${item.moduleId}`} className="mt-3 inline-flex min-h-11 items-center text-xs font-medium text-brand-700 hover:underline">Ver no módulo: {item.detail}</Link>
          </>}
        </article>;
      })}
      {!entries.length && <Empty title="Nenhuma publicação" description="Os avisos e materiais publicados aparecerão aqui." />}
    </section>
    <aside className="rounded-xl border border-slate-200 bg-white p-5 xl:sticky xl:top-6" aria-label="Prazos da disciplina"><h2 className="font-semibold">Próximas entregas</h2><div className="divide-y divide-slate-100">{deadlines.slice(0, 3).map(a => <Link key={a.id} href={canEdit ? '/questionarios' : `/questionarios/responder?id=${a.id}`} className="block py-4 text-sm hover:text-brand-700"><span className="mb-1 block text-xs text-slate-500">Até {dateLabel(a.deadline)}</span>{a.title}</Link>)}</div>{!deadlines.length && <p className="mt-3 text-sm text-slate-500">Nenhuma entrega pendente.</p>}</aside>
    <Dialog open={choosingModule} onClose={() => setChoosingModule(false)} title="Enviar materiais"><form className="space-y-5" onSubmit={e => { e.preventDefault(); if (moduleId) { setChoosingModule(false); setFilter('all'); onUpload(moduleId); } }}><Select label="Módulo de destino" value={moduleId} onChange={e => setModuleId(e.target.value)} required><option value="">Selecione o módulo</option>{modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</Select>{!modules.length && <p className="text-sm text-slate-600">Crie um módulo na aba Materiais e atividades antes de enviar arquivos.</p>}<Button type="submit" disabled={!moduleId}><BookOpen aria-hidden="true" className="size-4" />Continuar</Button></form></Dialog>
  </div>;
}
