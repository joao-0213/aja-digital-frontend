'use client';

import { resolveSubjectIcon, SubjectIconPicker } from './subject-icons';
import { SubjectCard } from './subject-card';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Button, Dialog, Empty, Input, PageHeading, Select, Textarea } from '@/components/ui';
import { textMatch, uid } from '@/lib/utils';
import { type SubjectIcon } from '@/models';

export function SubjectsPage() {
  const {
    db,
    user,
    role,
    mutate,
    busy
  } = useApp();
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState(params.get('turma') ?? 'all');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetClass, setTargetClass] = useState('c1');
  const [teacher, setTeacher] = useState('u2');
  const [icon, setIcon] = useState<SubjectIcon>('book');
  const [editing, setEditing] = useState<string | null>(null);
  const visible = db.subjects.filter(s => (classId === 'all' || s.classId === classId) && textMatch(s.name, search) && (role !== 'student' || db.classes.some(c => c.id === s.classId && c.studentIds.includes(user.id))) && (role !== 'teacher' || s.teacherId === user.id));
  return <>
    <PageHeading title={role === 'student' ? 'Minhas disciplinas' : 'Disciplinas'} description="Acesse os materiais e questionários de cada disciplina." action={role !== 'student' && <Button onClick={() => {
      setEditing(null);
      setIcon('book');
      setName('');
      setDescription('');
      setOpen(true);
    }}><Plus className="size-4" />Nova disciplina</Button>} />
    <div className="mb-7 grid max-w-2xl gap-3 sm:grid-cols-2">
      <Input label="Buscar disciplina" placeholder="Nome da disciplina" value={search} onChange={e => setSearch(e.target.value)} />
      <Select label="Turma" value={classId} onChange={e => setClassId(e.target.value)}>
        <option value="all">Todas as turmas</option>
        {db.classes.filter(c => c.active).map(c => <option value={c.id} key={c.id}>
          {c.name}
        </option>)}
      </Select>
    </div>
    {visible.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {visible.map(s => {
        return <SubjectCard key={s.id} subject={s} className={db.classes.find(c => c.id === s.classId)?.name} onEdit={role !== 'student' ? () => {
          setEditing(s.id);
          setName(s.name);
          setDescription(s.description);
          setTargetClass(s.classId);
          setTeacher(s.teacherId);
          setIcon(resolveSubjectIcon(s).value);
          setOpen(true);
        } : undefined} />;
      })}
    </div> : <Empty title="Nenhuma disciplina encontrada" description="Altere os filtros ou aguarde sua matrícula em uma turma." />}
    <Dialog open={open} onClose={() => setOpen(false)} title={editing ? 'Editar disciplina' : 'Nova disciplina'}>
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        const ok = await mutate(d => {
          if (editing) Object.assign(d.subjects.find(s => s.id === editing)!, {
            name: name.trim(),
            description,
            classId: targetClass,
            teacherId: teacher,
            icon
          });else d.subjects.push({
            id: uid('subject'),
            classId: targetClass,
            name: name.trim(),
            teacherId: teacher,
            color: 'violet',
            icon,
            description
          });
        }, 'Disciplina salva.');
        if (ok) setOpen(false);
      }}>
        <Input label="Nome" value={name} onChange={e => setName(e.target.value)} required />
        <Textarea label="Descrição" value={description} onChange={e => setDescription(e.target.value)} />
        <Select label="Turma" value={targetClass} onChange={e => setTargetClass(e.target.value)}>
          {db.classes.filter(c => c.active).map(c => <option key={c.id} value={c.id}>
            {c.name}
          </option>)}
        </Select>
        <Select label="Professor responsável" value={teacher} onChange={e => setTeacher(e.target.value)}>
          {db.users.filter(u => u.role === 'teacher').map(u => <option key={u.id} value={u.id}>
            {u.name}
          </option>)}
        </Select>
        <SubjectIconPicker value={icon} onChange={setIcon} disabled={busy} />
        <Button type="submit" loading={busy}>Salvar disciplina</Button>
      </form>
    </Dialog>
  </>;
}
