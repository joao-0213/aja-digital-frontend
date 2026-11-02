'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2, ChevronUp } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Dialog, Empty, Input, LinkButton, PageHeading, Select, Textarea } from '@/components/ui';
import { cn, uid, textMatch } from '@/lib/utils';
import { DEMO_DATE } from '@/mocks/database';
import { type Question } from '@/models';
import { canManageSubject } from '@/lib/access';
import { useRecordRevision } from '@/hooks/use-record-revision';
import { RecordConflict } from '@/components/shared/record-conflict';
import { needsAssessmentStructureRecovery, restoreAssessmentStructure } from '../lib/assessment-editor';

export function AssessmentBuilder() {
  const {
    db,
    user,
    role,
    mutate,
    busy
  } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const existing = db.assessments.find(a => a.id === params.get('id'));
  const availableModules = db.modules.filter(m => canManageSubject(db, user, m.subjectId));
  const revision = useRecordRevision('assessments', existing);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [module, setModule] = useState(existing?.moduleId ?? params.get('modulo') ?? availableModules[0]?.id ?? '');
  const [deadline, setDeadline] = useState(existing?.deadline ?? '2026-10-20T23:59');
  const [ids, setIds] = useState<string[]>(existing?.questionIds ?? []);
  const [bank, setBank] = useState(false);
  const [original, setOriginal] = useState(false);
  const [statement, setStatement] = useState('');
  const [options, setOptions] = useState(['', '', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [originals, setOriginals] = useState<Question[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [inspectedStructure, setInspectedStructure] = useState('');
  const hasDeliveries = !!existing && db.attempts.some(a => a.assessmentId === existing.id && !!a.submittedAt);
  const structuralLocked = hasDeliveries;
  const needsStructureRecovery = needsAssessmentStructureRecovery(existing, { moduleId: module, questionIds: ids, originals }, hasDeliveries);
  const structureSignature = existing ? JSON.stringify([existing.id, existing.revision ?? 0, existing.moduleId, existing.questionIds]) : '';
  if (role === 'student') return <Empty title="Criação de questionários" description="Escolha o perfil de professor ou administrador para acessar esta área." />;
  if (params.get('id') && !existing || params.get('modulo') && !availableModules.some(m => m.id === params.get('modulo')) || !availableModules.length) return <Empty title="Atividade indisponível" description="Seu vínculo ou atribuição não permite editar este contexto, ou o conteúdo foi retirado." action={<LinkButton href="/questionarios">Ver atividades</LinkButton>} />;
  const all = [...db.questions, ...originals];
  const save = async (status: 'draft' | 'published') => {
    setError('');
    if (revision.conflict) { setError('Confira a versão atual antes de salvar.'); return; }
    if (needsStructureRecovery) { setError('Consulte e use a estrutura atual para manter seu texto e salvar os campos permitidos.'); return; }
    if (!title.trim() || !module || !deadline) {
      setError('Preencha título, módulo e prazo.');
      return;
    }
    if (!ids.length) {
      setError('Adicione pelo menos uma questão.');
      return;
    }
    if (deadline < `${DEMO_DATE}T00:00`) {
      setError('O prazo deve ser posterior à data de referência da demonstração: 05/10/2026.');
      return;
    }
    if (existing && JSON.stringify(existing.questionIds) !== JSON.stringify(ids) && !window.confirm('Alterar as questões reinicia todas as respostas em rascunho desta atividade. Os alunos serão informados ao retomar. Deseja confirmar essa alteração?')) return;
    if (await mutate(d => {
      const current = d.assessments.find(a => a.id === existing?.id);
      if (current && d.attempts.some(a => a.assessmentId === current.id && a.submittedAt) && (current.moduleId !== module || JSON.stringify(current.questionIds) !== JSON.stringify(ids))) throw new Error('Já há uma entrega nesta atividade. Preserve as questões e o módulo; você pode corrigir título, orientações e prazo.');
      d.questions.push(...originals.filter(q => !d.questions.some(item => item.id === q.id)));
      const record = {
        ...current,
        id: existing?.id ?? uid('assessment'),
        publishedAt: existing?.publishedAt ?? (status === 'published' ? new Date().toISOString() : undefined),
        title: title.trim(),
        description,
        moduleId: module,
        deadline,
        questionIds: ids,
        status: current?.status === 'published' ? 'published' as const : status,
        authorId: current ? current.authorId : user.id
      };
      if (existing) d.assessments[d.assessments.findIndex(a => a.id === existing.id)] = record;else d.assessments.push(record);
    }, existing?.status === 'published' ? 'Questionário atualizado.' : status === 'published' ? 'Questionário publicado.' : 'Rascunho salvo.', existing ? revision.expected : undefined)) router.push('/questionarios');
  };
  return <>
    <PageHeading eyebrow="Ensino e avaliação" title={existing ? 'Editar questionário' : 'Criar questionário'} description="Selecione as questões na ordem desejada e configure o prazo." />
    {existing?.updatedAt && <p className="mb-4 text-xs text-slate-500">Última alteração: {db.users.find(u => u.id === existing.updatedBy)?.name ?? 'Equipe AJA'} · {new Date(existing.updatedAt).toLocaleString('pt-BR')}</p>}
    {revision.conflict && existing && <div className="mb-6"><RecordConflict key={existing.revision} author={db.users.find(u => u.id === existing.updatedBy)?.name ?? 'Equipe AJA'} updatedAt={existing.updatedAt} onReviewed={revision.acknowledge}><p><strong>{existing.title}</strong></p><p>{existing.description}</p><p>Prazo: {existing.deadline}</p><p>Módulo: {db.modules.find(m => m.id === existing.moduleId)?.title}</p><p>Questões: {existing.questionIds.map(id => db.questions.find(q => q.id === id)?.statement ?? 'Questão indisponível').join('\n\n')}</p></RecordConflict></div>}
    {structuralLocked && <p className="mb-5 rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-950">Esta atividade já recebeu entrega. Apenas título, orientações e prazo podem mudar.</p>}
    {needsStructureRecovery && existing && <section role="alert" className="mb-6 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
      <p className="font-semibold">A primeira entrega chegou durante sua edição.</p>
      <p>As alterações locais de módulo e questões não podem mais ser salvas. Consulte a estrutura atual para recuperar esses campos. Título, orientações e prazo serão mantidos; questões autorais locais ainda não salvas serão descartadas.</p>
      <Button variant="secondary" onClick={() => setInspectedStructure(structureSignature)}>Consultar estrutura atual</Button>
      {inspectedStructure === structureSignature && <div className="space-y-3 border-t border-amber-200 pt-3">
        <p><strong>Módulo atual:</strong> {db.modules.find(m => m.id === existing.moduleId)?.title ?? 'Módulo indisponível'}</p>
        <ol className="list-decimal space-y-2 pl-5">{existing.questionIds.map(id => <li key={id}>{db.questions.find(q => q.id === id)?.statement ?? 'Questão indisponível'}</li>)}</ol>
        <Button variant="secondary" onClick={() => {
          const restored = restoreAssessmentStructure({ title, description, deadline, moduleId: module, questionIds: ids, originals }, existing);
          setModule(restored.moduleId); setIds(restored.questionIds); setOriginals(restored.originals);
          setStatement(''); setOptions(['', '', '', '', '']); setExplanation(''); setCorrect(0);
          setBank(false); setOriginal(false); setError('');
        }}>Usar estrutura atual e manter meu texto</Button>
      </div>}
    </section>}
    <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="space-y-5">
        <h2 className="font-semibold">Configurações</h2>
        <Input label="Título" value={title} onChange={e => setTitle(e.target.value)} required maxLength={150} />
        <Textarea label="Orientações" value={description} onChange={e => setDescription(e.target.value)} />
        <Select label="Módulo da disciplina" value={module} disabled={structuralLocked} onChange={e => setModule(e.target.value)}>
          {availableModules.map(m => <option key={m.id} value={m.id}>{db.subjects.find(s => s.id === m.subjectId)?.name} · {m.title}</option>)}
        </Select>
        <Input label="Prazo de entrega" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
        <p className="text-xs leading-5 text-slate-400">Um único envio por aluno. Cada questão vale 1 ponto, com uma alternativa correta. A ordem das questões e alternativas é fixa.</p>
      </Card>
      <div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{ids.length} questões selecionadas</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={structuralLocked} onClick={() => setOriginal(true)}><Plus className="size-4" />Questão original</Button>
            <Button disabled={structuralLocked} onClick={() => setBank(true)}>Buscar no banco</Button>
          </div>
        </div>
        <div className="space-y-4">
          {ids.map((id, index) => {
            const q = all.find(q => q.id === id);
            return q && <Card key={id}>
            <div className="mb-4 flex items-center gap-2">
              <Badge tone="purple">Questão {index + 1}</Badge>
              <Badge>
                {q.topic}
              </Badge>
              <div className="ml-auto flex">
                <Button variant="ghost" disabled={structuralLocked || index === 0} aria-label={`Mover questão ${index + 1} para cima`} onClick={() => setIds(previous => {
                    const copy = [...previous];
                    [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
                    return copy;
                  })}>
                  <ChevronUp className="size-4" />
                </Button>
                <Button variant="ghost" disabled={structuralLocked} aria-label={`Remover questão ${index + 1}`} onClick={() => setIds(previous => previous.filter(qid => qid !== id))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            <p className="leading-7">
              {q.statement}
            </p>
            <ol className="mt-4 space-y-2">
              {q.options.map((o, i) => <li key={i} className={cn('rounded-lg px-3 py-2 text-sm', i === q.correct ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500')}>{String.fromCharCode(65 + i)}. {o}{i === q.correct && ' ✓'}</li>)}
            </ol>
          </Card>;
          })}
        </div>
        {!ids.length && <Empty title="Monte seu questionário" description="Selecione questões do banco ou escreva uma questão original." action={<Button disabled={structuralLocked} onClick={() => setBank(true)}>Escolher questões</Button>} />}
        <p role="alert" className="mt-4 text-sm text-rose-600">
          {error}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => { if (window.confirm('Descartar alterações não salvas e voltar às atividades?')) router.push('/questionarios'); }}>Cancelar</Button>
          {existing?.status !== 'published' && <Button variant="secondary" loading={busy} disabled={revision.conflict || needsStructureRecovery} onClick={() => void save('draft')}>Salvar rascunho</Button>}
          <Button loading={busy} disabled={revision.conflict || needsStructureRecovery} onClick={() => void save('published')}>{existing?.status === 'published' ? 'Salvar alterações' : 'Publicar questionário'}</Button>
        </div>
      </div>
    </div>
    <Dialog open={bank} onClose={() => setBank(false)} title="Adicionar do banco de questões">
      {structuralLocked && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950">A atividade recebeu a primeira entrega. A seleção de questões foi bloqueada. Volte ao editor para manter seu texto e conferir os campos permitidos.</p>}
      <Input aria-label="Buscar questões" placeholder="Buscar por tema ou enunciado…" value={search} disabled={structuralLocked} onChange={e => setSearch(e.target.value)} />
      <fieldset disabled={structuralLocked} className="my-4 max-h-80 space-y-3 overflow-y-auto">
        <legend className="sr-only">Selecionar questões do banco</legend>
        {db.questions.filter(q => textMatch(q.statement + ' ' + q.topic, search)).map(q => <label key={q.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
          <input className="mt-1 accent-brand-600" type="checkbox" checked={ids.includes(q.id)} onChange={e => { if (!structuralLocked) setIds(previous => e.target.checked ? [...previous, q.id] : previous.filter(id => id !== q.id)); }} />
          <span className="text-sm leading-6">
            <span className="block text-xs text-brand-600">{q.subject} · {q.topic}</span>
            {q.statement}
          </span>
        </label>)}
      </fieldset>
      <Button onClick={() => setBank(false)}>{structuralLocked ? 'Voltar ao editor' : `Concluir seleção (${ids.length})`}</Button>
    </Dialog>
    <Dialog open={original} onClose={() => setOriginal(false)} title="Nova questão original">
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        if (structuralLocked) return;
        const id = uid('question');
        setOriginals(old => [...old, {
          id,
          statement,
          options,
          correct,
          explanation,
          subject: db.subjects.find(s => s.id === db.modules.find(m => m.id === module)?.subjectId)?.name ?? 'Matemática',
          topic: 'Questão original',
          difficulty: 'medium',
          institution: 'AJA',
          year: 2026
        }]);
        setIds(old => [...old, id]);
        setOriginal(false);
        setStatement('');
        setOptions(['', '', '', '', '']);
        setExplanation('');
        setCorrect(0);
      }}>
        {structuralLocked && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950">A atividade recebeu a primeira entrega. Não é possível adicionar uma questão. Volte ao editor para salvar título, orientações e prazo.</p>}
        <fieldset disabled={structuralLocked} className="space-y-4">
          <legend className="sr-only">Questão autoral</legend>
          <Textarea label="Enunciado" value={statement} onChange={e => setStatement(e.target.value)} required />
          {options.map((o, i) => <Input key={i} label={`Alternativa ${String.fromCharCode(65 + i)}`} value={o} onChange={e => setOptions(old => old.map((v, j) => j === i ? e.target.value : v))} required />)}
          <Select label="Alternativa correta" value={correct} onChange={e => setCorrect(Number(e.target.value))}>
            {options.map((_, i) => <option key={i} value={i}>
              {String.fromCharCode(65 + i)}
            </option>)}
          </Select>
          <Textarea label="Explicação do gabarito" value={explanation} onChange={e => setExplanation(e.target.value)} required />
          <Button type="submit">Adicionar questão</Button>
        </fieldset>
        {structuralLocked && <Button variant="secondary" onClick={() => setOriginal(false)}>Voltar ao editor</Button>}
      </form>
    </Dialog>
  </>;
}
