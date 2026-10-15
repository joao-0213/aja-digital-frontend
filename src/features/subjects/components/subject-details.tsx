'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck, FileText, ListChecks, MessageSquare, Pencil, Play, Plus, Upload } from 'lucide-react';
import { ResponsiveDisclosure } from '@/components/ui/responsive-disclosure';
import { PublicationDate } from '@/components/ui/publication-date';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Dialog, Empty, Input, LinkButton, Textarea } from '@/components/ui';
import { useSubjectUpdates } from '../hooks/use-subject-updates';
import { SubjectWall } from './subject-wall';
import { MaterialComposer } from '@/features/materials';
import { dateLabel, uid } from '@/lib/utils';

export function SubjectDetails() {
  const { db, user, role, mutate, busy } = useApp();
  const params = useSearchParams();
  const id = params.get('id') ?? 's1';
  useSubjectUpdates(id, true);
  const materialsView = params.get('aba') === 'materiais';
  const subject = db.subjects.find(s => s.id === id);
  const [materialModule, setMaterialModule] = useState('');
  const [editing, setEditing] = useState(false);
  const [moduleDialog, setModuleDialog] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>([]);
  if (!subject) return <Empty title="Disciplina não encontrada" action={<LinkButton href="/disciplinas">Ver disciplinas</LinkButton>} />;
  const modules = db.modules.filter(m => m.subjectId === id).sort((a, b) => a.order - b.order);
  const canEdit = role === 'admin' || role === 'teacher' && subject.teacherId === user.id;
  const schoolClass = db.classes.find(c => c.id === subject.classId);
  const teacher = db.users.find(u => u.id === subject.teacherId);
  const editModule = (moduleId: string) => {
    const mod = modules.find(m => m.id === moduleId);
    setTitle(mod?.title ?? ''); setDescription(mod?.description ?? ''); setModuleDialog(moduleId);
  };

  return <>
    <Link href="/disciplinas" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700"><ArrowLeft aria-hidden="true" className="size-4" />Disciplinas</Link>
    <header className="course-banner mb-6 rounded-xl border border-slate-200 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 text-xs font-semibold tracking-wide text-brand-700">{schoolClass?.name} · Apoio às aulas presenciais</p><h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{subject.name}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{subject.description}</p></div>
        {canEdit && materialsView && <Button variant={editing ? 'primary' : 'secondary'} aria-pressed={editing} onClick={() => setEditing(!editing)}><Pencil aria-hidden="true" className="size-4" />{editing ? 'Concluir organização' : 'Organizar módulos'}</Button>}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm">
        <span className="text-slate-500">Docente: <span className="text-slate-700">{teacher?.name}</span></span>
        <Link href={`/forum?disciplina=${id}`} className="inline-flex min-h-11 items-center gap-2 font-medium text-brand-700"><MessageSquare aria-hidden="true" className="size-4" />Dúvidas da turma</Link>
        {canEdit && <Link href={`/frequencia?disciplina=${id}`} className="inline-flex min-h-11 items-center gap-2 font-medium text-brand-700"><ListChecks aria-hidden="true" className="size-4" />Fazer chamada</Link>}
      </div>
    </header>

    <nav aria-label="Seções da disciplina" className="mb-6 flex gap-6 border-b border-slate-200">
      {[{ label: 'Mural', href: `/disciplinas/detalhes?id=${id}`, active: !materialsView }, { label: 'Materiais e atividades', href: `/disciplinas/detalhes?id=${id}&aba=materiais`, active: materialsView }].map(tab => <Link key={tab.label} href={tab.href} aria-current={tab.active ? 'page' : undefined} className={`min-h-12 border-b-2 px-1 py-3 text-sm font-semibold ${tab.active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>{tab.label}</Link>)}
    </nav>
    {!materialsView ? <SubjectWall key={id} subjectId={id} canEdit={canEdit} onUpload={setMaterialModule} /> : <div className="grid items-start gap-6 xl:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="xl:sticky xl:top-6">
        <ResponsiveDisclosure title="Nesta disciplina">
        <nav aria-label="Índice de módulos" className="flex flex-wrap gap-2 xl:flex-col">
          {modules.map((mod, index) => <a key={mod.id} href={`#module-${mod.id}`} onClick={() => setCollapsed(current => current.filter(value => value !== mod.id))} className="flex min-h-11 items-start gap-3 rounded-lg px-3 py-3 text-sm leading-5 text-slate-600 hover:bg-brand-50 hover:text-brand-700"><span className="font-semibold tabular-nums text-brand-600">{String(index + 1).padStart(2, '0')}</span>{mod.title}</a>)}
        </nav>
        {canEdit && <Button variant="ghost" className="mt-3" onClick={() => editModule('new')}><Plus aria-hidden="true" className="size-4" />Novo módulo</Button>}
        </ResponsiveDisclosure>
      </aside>
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Materiais e atividades</h2><Button variant="ghost" onClick={() => setCollapsed(collapsed.length ? [] : modules.map(m => m.id))}>{collapsed.length ? 'Expandir módulos' : 'Recolher módulos'}</Button></div>
        {canEdit && <p className="rounded-lg bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-900">Use Enviar materiais para adicionar PDFs ao módulo. É possível selecionar vários arquivos.</p>}
        {modules.map((mod, index) => {
          const materials = db.materials.filter(m => m.moduleId === mod.id).sort((a, b) => a.order - b.order);
          const assessments = db.assessments.filter(a => a.moduleId === mod.id && (canEdit || a.status === 'published'));
          const open = !collapsed.includes(mod.id);
          return <section id={`module-${mod.id}`} key={mod.id} className="module-section overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 bg-slate-50/70 p-4 sm:px-5">
              <h3 className="min-w-0 flex-1"><button aria-expanded={open} aria-controls={`content-${mod.id}`} className="flex w-full items-center gap-3 text-left" onClick={() => setCollapsed(current => open ? [...current, mod.id] : current.filter(value => value !== mod.id))}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-sm font-semibold text-brand-700">{index + 1}</span><span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">{mod.title}</span><span className="mt-1 block text-xs font-normal text-slate-500">{materials.length} {materials.length === 1 ? 'material' : 'materiais'} · {assessments.length} {assessments.length === 1 ? 'atividade' : 'atividades'}</span></span><ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
              </button></h3>
              {canEdit && editing && <div className="flex items-center"><Button variant="ghost" aria-label={`Editar módulo ${mod.title}`} onClick={() => editModule(mod.id)}><Pencil className="size-4" /></Button>
                <Button variant="ghost" disabled={index === 0 || busy} aria-label={`Mover ${mod.title} para cima`} onClick={() => void mutate(d => { const current = d.modules.find(m => m.id === mod.id)!; const previous = d.modules.find(m => m.id === modules[index - 1].id)!; [current.order, previous.order] = [previous.order, current.order]; })}><ChevronUp className="size-4" /></Button>
                <Button variant="ghost" disabled={index === modules.length - 1 || busy} aria-label={`Mover ${mod.title} para baixo`} onClick={() => void mutate(d => { const current = d.modules.find(m => m.id === mod.id)!; const next = d.modules.find(m => m.id === modules[index + 1].id)!; [current.order, next.order] = [next.order, current.order]; })}><ChevronDown className="size-4" /></Button>
              </div>}
            </div>
            <div id={`content-${mod.id}`} hidden={!open}>
              {mod.description && <p className="px-5 pt-4 text-sm leading-6 text-slate-500">{mod.description}</p>}
              <div className="divide-y divide-slate-100 px-4 sm:px-5">
                {materials.map((m, materialIndex) => {
                  const done = db.progress.some(p => p.userId === user.id && p.materialId === m.id && p.completed);
                  const Icon = m.kind === 'pdf' ? FileText : m.kind === 'video' ? Play : BookOpen;
                  return <div key={m.id} className="flex items-center gap-2"><Link href={`/materiais?id=${m.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-4 hover:bg-brand-50/50"><span className="rounded-lg bg-brand-50 p-2.5 text-brand-700"><Icon aria-hidden="true" className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{m.title}</p><p className="mt-1 text-xs text-slate-500">{m.kind === 'pdf' ? 'PDF' : m.kind === 'video' ? 'Vídeo de apoio' : 'Texto de apoio'}{m.fileSize ? ` · ${(m.fileSize / 1024).toFixed(0)} KB` : ` · ${m.duration} min de estudo`}</p><p className="mt-1 text-xs text-slate-500"><PublicationDate value={m.createdAt} /></p></div>{role === 'student' && done && <CheckCircle2 aria-label="Concluído" className="size-5 shrink-0 text-emerald-600" />}</Link>
                    {canEdit && editing && <Button variant="ghost" aria-label={`Mover ${m.title} para cima`} disabled={materialIndex === 0 || busy} onClick={() => void mutate(d => { const current = d.materials.find(a => a.id === m.id)!; const previous = d.materials.find(a => a.id === materials[materialIndex - 1].id)!; [current.order, previous.order] = [previous.order, current.order]; })}><ChevronUp className="size-4" /></Button>}
                  </div>;
                })}
                {assessments.map(a => <Link key={a.id} href={a.status === 'published' ? `/questionarios/responder?id=${a.id}` : `/questionarios/criar?id=${a.id}`} className="flex flex-wrap items-center gap-3 rounded-lg py-4 hover:bg-brand-50/50"><span className="rounded-lg bg-amber-50 p-2.5 text-amber-700"><ClipboardCheck aria-hidden="true" className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{a.title}</p><p className="mt-1 text-xs text-slate-500">{a.questionIds.length} {a.questionIds.length === 1 ? 'questão' : 'questões'} · Entrega até {dateLabel(a.deadline)}</p>{a.status === 'published' && <p className="mt-1 text-xs text-slate-500"><PublicationDate value={a.publishedAt} /></p>}</div><Badge tone={a.status === 'draft' ? 'neutral' : 'amber'}>{a.status === 'draft' ? 'Rascunho' : 'Atividade'}</Badge></Link>)}
                {!materials.length && !assessments.length && <p className="py-6 text-sm text-slate-500">{canEdit ? 'Nenhum material ou atividade neste módulo.' : 'Os materiais deste módulo serão publicados pelo professor.'}</p>}
              </div>
              {canEdit && <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-4 sm:px-5"><Button variant="secondary" onClick={() => setMaterialModule(mod.id)}><Upload aria-hidden="true" className="size-4" />Enviar materiais</Button><LinkButton secondary href={`/questionarios/criar?modulo=${mod.id}`}><Plus aria-hidden="true" className="size-4" />Criar atividade</LinkButton></div>}
            </div>
          </section>;
        })}
        {!modules.length && <Empty title="Nenhum módulo cadastrado" description={canEdit ? 'Crie o primeiro módulo para publicar os materiais das aulas.' : 'Os módulos serão exibidos após a publicação pelo professor.'} action={canEdit && <Button onClick={() => editModule('new')}>Criar primeiro módulo</Button>} />}
      </div>
    </div>
    }
    {materialModule && <MaterialComposer key={materialModule} moduleId={materialModule} onClose={() => setMaterialModule('')} />}
    <Dialog open={moduleDialog !== null} onClose={() => { if (!busy) setModuleDialog(null); }} title={moduleDialog === 'new' ? 'Novo módulo' : 'Editar módulo'}>
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault();
        if (!title.trim()) return;
        const ok = await mutate(d => {
          if (moduleDialog === 'new') d.modules.push({ id: uid('module'), subjectId: id, title: title.trim(), description: description.trim(), order: Math.max(0, ...modules.map(m => m.order)) + 1 });
          else Object.assign(d.modules.find(m => m.id === moduleDialog)!, { title: title.trim(), description: description.trim() });
        }, 'Módulo salvo.');
        if (ok) setModuleDialog(null);
      }}><Input label="Título do módulo" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} /><Textarea label="Orientações do módulo (opcional)" value={description} onChange={event => setDescription(event.target.value)} /><div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setModuleDialog(null)}>Cancelar</Button><Button type="submit" loading={busy}>Salvar módulo</Button></div></form>
    </Dialog>
  </>;
}
