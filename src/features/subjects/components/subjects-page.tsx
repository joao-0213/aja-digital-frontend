'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Button, Check, Dialog, Empty, Input, PageHeading, Select, Textarea } from '@/components/ui';
import { isActiveUser, visibleSubjects, visibleClasses } from '@/lib/access';
import { textMatch, uid } from '@/lib/utils';
import type { Subject, SubjectIcon } from '@/models';
import { resolveSubjectIcon, SubjectIconPicker } from './subject-icons';
import { SubjectCard } from './subject-card';
import { teachingTeamOptions } from '../lib/teaching-team';

export function SubjectsPage() {
  const { db, user, role, mutate, busy } = useApp();
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState(params.get('turma') ?? 'all');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetClass, setTargetClass] = useState('');
  const [teachers, setTeachers] = useState<string[]>([]);
  const [icon, setIcon] = useState<SubjectIcon>('book');
  const [editing, setEditing] = useState<Subject | null>(null);
  const [expectedRevision, setExpectedRevision] = useState(0);
  const [initial, setInitial] = useState('');
  const [compared, setCompared] = useState(false);
  const [error, setError] = useState('');
  const formState = JSON.stringify({ name, description, targetClass, teachers, icon });
  const dirty = open && initial !== formState;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const schoolClasses = visibleClasses(db, user).filter(item => item.active && !item.deletedAt);
  const visible = visibleSubjects(db, user).filter(subject => (classId === 'all' || subject.classId === classId) && textMatch(subject.name, search));
  const current = db.subjects.find(subject => subject.id === editing?.id);
  const conflict = !!editing && (!current || !!current.deletedAt || (current.revision ?? 0) !== expectedRevision);
  const teamOptions = teachingTeamOptions(db.users, teachers);
  const staff = teamOptions.filter(option => option.available);
  const unavailableTeachers = teamOptions.filter(option => !option.available);
  const canAdmin = role === 'admin' && isActiveUser(user);
  const openEditor = (subject?: Subject) => {
    const values = { name: subject?.name ?? '', description: subject?.description ?? '', targetClass: subject?.classId ?? schoolClasses[0]?.id ?? '', teachers: subject?.teacherIds ?? [], icon: subject ? resolveSubjectIcon(subject).value : 'book' as SubjectIcon };
    setEditing(subject ?? null); setExpectedRevision(subject?.revision ?? 0);
    setName(values.name); setDescription(values.description); setTargetClass(values.targetClass); setTeachers([...values.teachers]); setIcon(values.icon);
    setInitial(JSON.stringify(values)); setError(''); setCompared(false); setOpen(true);
  };
  const close = () => { if (!busy && (!dirty || window.confirm('Descartar as alterações não salvas desta disciplina?'))) setOpen(false); };
  const teamNames = (ids: string[]) => ids.map(id => db.users.find(item => item.id === id)?.name ?? 'Docente indisponível').join(', ') || 'Sem docentes atribuídos';

  return <>
    <PageHeading title={role === 'student' ? 'Minhas disciplinas' : 'Disciplinas'} description="Acesse os materiais e questionários de cada disciplina." action={canAdmin && <Button disabled={!schoolClasses.length} onClick={() => openEditor()}><Plus aria-hidden="true" className="size-4" />Nova disciplina</Button>} />
    {canAdmin && !schoolClasses.length && <p className="mb-5 text-sm text-slate-500">Cadastre ou ative uma turma para criar disciplinas.</p>}
    <div className="mb-7 grid max-w-2xl gap-3 sm:grid-cols-2">
      <Input label="Buscar disciplina" placeholder="Nome da disciplina" value={search} onChange={event => setSearch(event.target.value)} />
      <Select label="Turma" value={classId} onChange={event => setClassId(event.target.value)}><option value="all">Todas as turmas</option>{schoolClasses.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>
    </div>
    {visible.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map(subject => <SubjectCard key={subject.id} subject={subject} className={db.classes.find(item => item.id === subject.classId)?.name} onEdit={canAdmin ? () => openEditor(subject) : undefined} />)}</div> : <Empty title="Nenhuma disciplina encontrada" description={role === 'teacher' ? 'Altere os filtros ou aguarde uma atribuição administrativa.' : 'Altere os filtros ou aguarde sua matrícula em uma turma.'} />}
    <Dialog open={open && canAdmin} onClose={close} title={editing ? 'Editar disciplina e equipe' : 'Nova disciplina'}>
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault();
        if (conflict || !targetClass || !name.trim() || unavailableTeachers.length) return;
        const removed = current?.teacherIds.filter(id => !teachers.includes(id)) ?? [];
        if (removed.length && !window.confirm(`Encerrar o acesso de ${teamNames(removed)} a esta disciplina? As publicações e seus registros anteriores serão preservados.`)) return;
        setError('');
        const ok = await mutate(draft => {
          const values = { name: name.trim(), description: description.trim(), classId: targetClass, teacherIds: [...teachers], icon };
          if (editing) {
            const subject = draft.subjects.find(item => item.id === editing.id);
            if (!subject || subject.deletedAt) throw new Error('Disciplina indisponível.');
            Object.assign(subject, values);
          } else draft.subjects.push({ id: uid('subject'), ...values, color: 'violet' });
        }, 'Disciplina salva.', editing ? { expected: [{ collection: 'subjects', id: editing.id, revision: expectedRevision }] } : undefined);
        if (ok) setOpen(false);
        else setError('Não foi possível salvar. Seu preenchimento foi mantido; confira a mensagem e tente novamente.');
      }}>
        <Input label="Nome" value={name} onChange={event => setName(event.target.value)} required maxLength={100} />
        <Textarea label="Descrição" value={description} onChange={event => setDescription(event.target.value)} />
        <Select label="Turma" value={targetClass} onChange={event => setTargetClass(event.target.value)} required><option value="" disabled>Selecione uma turma</option>{schoolClasses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium text-slate-700">Equipe docente</legend><p className="text-sm leading-6 text-slate-500">Todos os docentes atribuídos têm as mesmas permissões sobre os conteúdos da disciplina, preservando a autoria das publicações.</p>{staff.map(item => <Check key={item.id} label={item.name} checked={item.selected} onChange={checked => setTeachers(currentIds => checked ? [...currentIds, item.id] : currentIds.filter(id => id !== item.id))} />)}{!staff.length && <p className="text-sm text-slate-500">Cadastre um docente em Usuários e docentes. Você pode salvar a disciplina sem equipe.</p>}
          {unavailableTeachers.length > 0 && <div role="alert" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6"><p className="font-semibold">Revise os docentes selecionados</p><p>Há docentes selecionados que não estão mais disponíveis. Remova cada seleção indisponível antes de salvar. Seu texto e os demais docentes serão mantidos.</p><ul className="space-y-3">{unavailableTeachers.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words"><strong>{item.name}</strong><span className="block text-slate-600">{item.reason}</span></span><Button variant="secondary" disabled={busy} aria-label={`Remover ${item.name} da seleção`} onClick={() => setTeachers(currentIds => currentIds.filter(id => id !== item.id))}>Remover da seleção</Button></li>)}</ul></div>}
        </fieldset>
        <SubjectIconPicker value={icon} onChange={setIcon} disabled={busy} />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {conflict && <div role="alert" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6"><p>A disciplina mudou desde a abertura. Seu preenchimento foi mantido.</p>{current && !current.deletedAt ? <><p>Última alteração: {db.users.find(item => item.id === current.updatedBy)?.name ?? 'Equipe administrativa'} · {current.updatedAt ? new Date(current.updatedAt).toLocaleString('pt-BR') : 'data não registrada'}.</p><Button variant="secondary" onClick={() => setCompared(true)}>Conferir versão atual</Button>{compared && <><p>Nome atual: {current.name}<br />Descrição atual: {current.description || 'Sem descrição'}<br />Turma atual: {db.classes.find(item => item.id === current.classId)?.name}<br />Equipe atual: {teamNames(current.teacherIds)}</p><Button variant="secondary" onClick={() => { setExpectedRevision(current.revision ?? 0); setCompared(false); }}>Conferi a versão atual; manter meu preenchimento</Button></>}</> : <p>A disciplina foi retirada. Feche esta edição e volte à lista.</p>}</div>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={close}>Cancelar</Button><Button type="submit" loading={busy} disabled={conflict || !targetClass || !name.trim() || unavailableTeachers.length > 0}>Salvar disciplina</Button></div>
      </form>
    </Dialog>
  </>;
}
