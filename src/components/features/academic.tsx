'use client';

import { resolveSubjectIcon, SubjectIconPicker } from './subject-icons';
import { SubjectCard } from './subject-card';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Users, GraduationCap, Pencil, Archive } from 'lucide-react';
import { useApp } from '@/components/providers';
import { Badge, Button, Card, Check, Dialog, Empty, Input, LinkButton, PageHeading, Select, Textarea } from '@/components/ui';
import { textMatch, uid } from '@/lib/utils';
import { validateClassCode } from '@/lib/domain';
import type { SchoolClass, SubjectIcon } from '@/models';
export function ClassesPage() {
  const {
    db,
    mutate,
    busy,
    role
  } = useApp();
  const [search, setSearch] = useState('');
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [open, setOpen] = useState(false);
  const [archive, setArchive] = useState<SchoolClass | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [shift, setShift] = useState<SchoolClass['shift']>('Noite');
  const [year, setYear] = useState(2026);
  const [error, setError] = useState('');
  if (role === 'student') return <Empty title="Área de gestão" description="Use o perfil de administrador na demonstração para gerenciar turmas." />;
  const edit = (item: SchoolClass | null) => {
    setEditing(item);
    setName(item?.name ?? '');
    setCode(item?.code ?? '');
    setShift(item?.shift ?? 'Noite');
    setYear(item?.year ?? 2026);
    setError('');
    setOpen(true);
  };
  const save = async () => {
    const validation = validateClassCode(code, db.classes, editing?.id);
    if (validation) {
      setError(validation);
      return;
    }
    const ok = await mutate(d => {
      if (editing) {
        Object.assign(d.classes.find(c => c.id === editing.id)!, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          shift,
          year
        });
      } else d.classes.push({
        id: uid('class'),
        name: name.trim(),
        code: code.trim().toUpperCase(),
        shift,
        year,
        active: true,
        studentIds: []
      });
    }, 'Turma salva.');
    if (ok) setOpen(false);
  };
  const items = db.classes.filter(c => (inactive || c.active) && textMatch(c.name + ' ' + c.code, search));
  return <>
    <PageHeading eyebrow="Gestão acadêmica" title="Turmas" description="Cadastre e gerencie as turmas." action={role === 'admin' && <Button onClick={() => edit(null)}><Plus className="size-4" />Nova turma</Button>} />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="w-full sm:w-80">
        <Input aria-label="Buscar turmas" placeholder="Buscar por nome ou código…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <Check label="Mostrar turmas inativas" checked={inactive} onChange={setInactive} />
    </div>
    {items.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.map(c => <Card key={c.id}>
        <div className="mb-6 flex items-center justify-between">
          <span className="rounded-xl bg-brand-50 p-3 text-brand-600">
            <GraduationCap className="size-6" />
          </span>
          <Badge tone={c.active ? 'green' : 'neutral'}>
            {c.active ? 'Ativa' : 'Inativa'}
          </Badge>
        </div>
        <h2 className="text-lg font-semibold">
          {c.name}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{c.code} · {c.year} · {c.shift}</p>
        <div className="my-5 flex items-center gap-2 text-sm text-slate-500"><Users className="size-4" />{c.studentIds.length} alunos matriculados</div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <LinkButton secondary href={`/disciplinas?turma=${c.id}`}>Ver disciplinas</LinkButton>
          {role === 'admin' && <>
            <Button variant="ghost" aria-label={`Editar ${c.name}`} onClick={() => edit(c)}>
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" aria-label={c.active ? `Inativar ${c.name}` : `Reativar ${c.name}`} onClick={() => setArchive(c)}>
              <Archive className="size-4" />
            </Button>
          </>}
        </div>
      </Card>)}
    </div> : <Empty title="Nenhuma turma encontrada" description="Tente outro nome ou inclua as turmas inativas." />}
    <Dialog open={open} onClose={() => setOpen(false)} title={editing ? 'Editar turma' : 'Criar nova turma'}>
      <form onSubmit={e => {
        e.preventDefault();
        void save();
      }} className="space-y-4">
        <Input label="Nome da turma" value={name} onChange={e => setName(e.target.value)} required maxLength={100} />
        <Input label="Código único" value={code} onChange={e => setCode(e.target.value)} required pattern="[A-Za-z0-9-]+" maxLength={20} error={error} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Ano" type="number" value={year} onChange={e => setYear(Number(e.target.value))} min={2020} max={2100} required />
          <Select label="Turno" value={shift} onChange={e => setShift(e.target.value as SchoolClass['shift'])}>
            <option>Manhã</option>
            <option>Tarde</option>
            <option>Noite</option>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" loading={busy}>Salvar turma</Button>
        </div>
      </form>
    </Dialog>
    <Dialog open={!!archive} onClose={() => setArchive(null)} title={archive?.active ? 'Inativar turma?' : 'Reativar turma?'}>
      <p className="mb-6 text-sm leading-6 text-slate-500">O histórico de {archive?.name} será preservado. Turmas inativas não aceitam novas matrículas.</p>
      <Button loading={busy} onClick={async () => {
        if (await mutate(d => {
          const item = d.classes.find(c => c.id === archive?.id);
          if (item) item.active = !item.active;
        }, 'Situação da turma atualizada.')) setArchive(null);
      }}>Confirmar</Button>
    </Dialog>
  </>;
}
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
export { SubjectDetails } from './subject-details';
