'use client';

import { useState } from 'react';
import { Plus, Users, GraduationCap, Pencil, Archive } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Check, Dialog, Empty, Input, LinkButton, PageHeading, Select } from '@/components/ui';
import { textMatch, uid } from '@/lib/utils';
import { validateClassCode } from '@/lib/domain';
import { type SchoolClass } from '@/models';

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
