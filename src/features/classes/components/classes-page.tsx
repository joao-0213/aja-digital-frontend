'use client';

import { useEffect, useState } from 'react';
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
    role,
    user
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
  const [expectedRevision, setExpectedRevision] = useState(0);
  const [compared, setCompared] = useState(false);
  const [initial, setInitial] = useState('');
  const dirty = open && initial !== JSON.stringify({ name, code, shift, year });
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  if (role !== 'admin' || user.active === false || user.deletedAt) return <Empty title="Área de gestão" description="Use o perfil de administrador na demonstração para gerenciar turmas." />;
  const current = db.classes.find(item => item.id === editing?.id);
  const conflict = !!editing && (!current || !!current.deletedAt || (current.revision ?? 0) !== expectedRevision);
  const currentArchive = db.classes.find(item => item.id === archive?.id);
  const archiveConflict = !!archive && (!currentArchive || !!currentArchive.deletedAt || (currentArchive.revision ?? 0) !== (archive.revision ?? 0));
  const close = () => { if (!busy && (!dirty || window.confirm('Descartar as alterações não salvas desta turma?'))) setOpen(false); };
  const edit = (item: SchoolClass | null) => {
    setEditing(item);
    setName(item?.name ?? '');
    setCode(item?.code ?? '');
    setShift(item?.shift ?? 'Noite');
    setYear(item?.year ?? 2026);
    setError('');
    setExpectedRevision(item?.revision ?? 0);
    setInitial(JSON.stringify({ name: item?.name ?? '', code: item?.code ?? '', shift: item?.shift ?? 'Noite', year: item?.year ?? 2026 }));
    setCompared(false);
    setOpen(true);
  };
  const save = async () => {
    if (conflict) return;
    const validation = validateClassCode(code, db.classes, editing?.id);
    if (validation) {
      setError(validation);
      return;
    }
    const ok = await mutate(d => {
      const latestValidation = validateClassCode(code, d.classes, editing?.id);
      if (latestValidation) throw new Error(latestValidation);
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
    }, 'Turma salva.', editing ? { expected: [{ collection: 'classes', id: editing.id, revision: expectedRevision }] } : undefined);
    if (ok) setOpen(false);
  };
  const items = db.classes.filter(c => !c.deletedAt && (inactive || c.active) && textMatch(c.name + ' ' + c.code, search));
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
          <LinkButton secondary href={`/alunos?turma=${c.id}`}>Ver matrículas</LinkButton>
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
    <Dialog open={open} onClose={close} title={editing ? 'Editar turma' : 'Criar nova turma'}>
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
          <Button variant="secondary" disabled={busy} onClick={close}>Cancelar</Button>
          <Button type="submit" loading={busy} disabled={conflict}>Salvar turma</Button>
        </div>
        {conflict && <div role="alert" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6"><p>A turma mudou desde a abertura. Seu preenchimento foi mantido.</p>{current && !current.deletedAt ? <><p>Última alteração: {db.users.find(item => item.id === current.updatedBy)?.name ?? 'Equipe administrativa'} · {current.updatedAt ? new Date(current.updatedAt).toLocaleString('pt-BR') : 'data não registrada'}.</p><Button variant="secondary" onClick={() => setCompared(true)}>Conferir versão atual</Button>{compared && <><p>{current.name} · {current.code}<br />{current.year} · {current.shift} · {current.active ? 'Ativa' : 'Inativa'}</p><Button variant="secondary" onClick={() => { setExpectedRevision(current.revision ?? 0); setCompared(false); }}>Conferi a versão atual; manter meu preenchimento</Button></>}</> : <p>A turma não está mais disponível. Feche esta edição.</p>}</div>}
      </form>
    </Dialog>
    <Dialog open={!!archive} onClose={() => setArchive(null)} title={archive?.active ? 'Inativar turma?' : 'Reativar turma?'}>
      <p className="mb-6 text-sm leading-6 text-slate-500">O histórico de {archive?.name} será preservado. Inativar encerra os vínculos e cancela as matrículas pendentes; alunos perdem acesso à turma. Reativar a turma não restaura vínculos ou pendências encerrados.</p>
      {archiveConflict && <div role="alert" className="mb-4 space-y-3 rounded-lg bg-amber-50 p-4 text-sm leading-6"><p>A turma mudou. {currentArchive?.name} está {currentArchive?.active ? 'ativa' : 'inativa'}. Última alteração: {db.users.find(item => item.id === currentArchive?.updatedBy)?.name ?? 'Equipe administrativa'} · {currentArchive?.updatedAt ? new Date(currentArchive.updatedAt).toLocaleString('pt-BR') : 'data não registrada'}.</p>{currentArchive && !currentArchive.deletedAt && <Button variant="secondary" onClick={() => setArchive(currentArchive)}>Conferi a versão atual</Button>}</div>}
      <Button loading={busy} disabled={archiveConflict} onClick={async () => {
        if (!archive || archiveConflict) return;
        if (await mutate(d => {
          const item = d.classes.find(c => c.id === archive?.id);
          if (item) item.active = !item.active;
        }, 'Situação da turma atualizada.', { expected: [{ collection: 'classes', id: archive.id, revision: archive.revision ?? 0 }] })) setArchive(null);
      }}>Confirmar</Button>
    </Dialog>
  </>;
}
