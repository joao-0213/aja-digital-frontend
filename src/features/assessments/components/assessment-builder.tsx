'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2, ChevronUp } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Dialog, Empty, Input, LinkButton, PageHeading, Select, Textarea } from '@/components/ui';
import { cn, uid } from '@/lib/utils';
import { hasDelivery } from '@/lib/activities';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { assessmentQuestions } from '@/lib/question-composition';
import { BankSelector, toggleBankSelection, type BankQuestion } from '@/features/questions';
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
  const [kind, setKind] = useState<'quiz' | 'work'>(existing?.kind ?? 'quiz');
  const [hasDeadline, setHasDeadline] = useState(!!existing?.deadline);
  const [required, setRequired] = useState(existing?.required !== false);
  const [allowLate, setAllowLate] = useState(existing?.allowLate ?? false);
  const [graded, setGraded] = useState(existing?.maxGrade !== undefined);
  const [maxGrade, setMaxGrade] = useState(String(existing?.maxGrade ?? 10));
  const [review, setReview] = useState(false);
  const [ids, setIds] = useState<string[]>(existing?.questionIds ?? []);
  const [bank, setBank] = useState(false);
  const [original, setOriginal] = useState(false);
  const [statement, setStatement] = useState('');
  const [options, setOptions] = useState(['', '', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [originals, setOriginals] = useState<Question[]>([]);
  const [error, setError] = useState('');
  const [bankPreview, setBankPreview] = useState<BankQuestion[]>([]);
  const [inspectedStructure, setInspectedStructure] = useState('');
  const hasDeliveries = !!existing && hasDelivery(db, existing.id);
  const structuralLocked = hasDeliveries;
  const needsStructureRecovery = needsAssessmentStructureRecovery(existing, { moduleId: module, questionIds: ids, originals }, hasDeliveries) || !!existing && hasDeliveries && (kind !== (existing.kind ?? 'quiz') || required !== (existing.required !== false) || hasDeadline !== !!existing.deadline || allowLate !== !!existing.allowLate || graded !== (existing.maxGrade !== undefined) || graded && Number(maxGrade) !== existing.maxGrade);
  const structureSignature = existing ? JSON.stringify([existing.id, existing.revision ?? 0, existing.moduleId, existing.questionIds]) : '';
  const formSignature = JSON.stringify([title, description, module, deadline, kind, hasDeadline, required, allowLate, graded, maxGrade, ids, originals, statement, options, correct, explanation]);
  const [openedSignature] = useState(formSignature);
  useUnsavedChanges(formSignature !== openedSignature);
  if (role === 'student') return <Empty title="Criação de atividades" description="Esta área está disponível para a equipe autorizada." />;
  if (params.get('id') && !existing || params.get('modulo') && !availableModules.some(m => m.id === params.get('modulo')) || !availableModules.length) return <Empty title="Atividade indisponível" description="Seu vínculo ou atribuição não permite editar este contexto, ou o conteúdo foi retirado." action={<LinkButton href="/questionarios">Ver atividades</LinkButton>} />;
  const all = [...(existing ? assessmentQuestions(db, existing) : []), ...db.questions, ...originals];
  const save = async (status: 'draft' | 'published') => {
    setError('');
    if (ids.some(id => bankPreview.some(question => question.id === id))) { setError('A publicação de questões selecionadas no acervo estará disponível com a migração das atividades.'); return; }
    if (revision.conflict) { setError('Confira a versão atual antes de salvar.'); return; }
    if (needsStructureRecovery) { setError('Consulte e use a estrutura atual para manter seu texto e salvar os campos permitidos.'); return; }
    if (!title.trim() || !module || hasDeadline && !deadline) {
      setError('Preencha título, módulo e a data quando houver prazo.');
      return;
    }
    if (kind === 'quiz' && !ids.length) {
      setError('Adicione pelo menos uma questão.');
      return;
    }
    if (kind === 'work' && graded && (!Number.isFinite(Number(maxGrade)) || Number(maxGrade) <= 0)) {
      setError('Informe um máximo positivo para a nota opcional.');
      return;
    }
    if (status === 'published' && !review) { setReview(true); return; }
    if (existing && JSON.stringify(existing.questionIds) !== JSON.stringify(kind === 'quiz' ? ids : []) && !window.confirm('Alterar as questões reinicia todas as respostas em rascunho desta atividade. Os alunos serão informados ao retomar. Deseja confirmar essa alteração?')) return;
    if (await mutate(d => {
      const current = d.assessments.find(a => a.id === existing?.id);
      if (current && d.attempts.some(a => a.assessmentId === current.id && a.submittedAt) && (current.moduleId !== module || JSON.stringify(current.questionIds) !== JSON.stringify(ids))) throw new Error('Já há uma entrega nesta atividade. Preserve as questões e o módulo; você pode corrigir título, orientações e prazo.');
      const record = {
        ...current,
        id: existing?.id ?? uid('assessment'),
        publishedAt: existing?.publishedAt ?? (status === 'published' ? new Date().toISOString() : undefined),
        title: title.trim(),
        description,
        moduleId: module,
        deadline: hasDeadline ? deadline : '',
        kind: structuralLocked ? current?.kind : kind,
        required: structuralLocked ? current?.required : required,
        allowLate: structuralLocked ? current?.allowLate : hasDeadline && allowLate,
        maxGrade: structuralLocked ? current?.maxGrade : kind === 'work' && graded ? Number(maxGrade) : undefined,
        questionIds: kind === 'quiz' ? ids : [],
        questions: kind === 'quiz' ? ids.map(id => all.find(q => q.id === id)!) : [],
        status: current?.status === 'published' ? 'published' as const : status,
        authorId: current ? current.authorId : user.id
      };
      if (existing) d.assessments[d.assessments.findIndex(a => a.id === existing.id)] = record;else d.assessments.push(record);
    }, existing?.status === 'published' ? 'Atividade atualizada.' : status === 'published' ? 'Atividade publicada.' : 'Rascunho salvo.', existing ? revision.expected : undefined)) router.push('/questionarios');
  };
  return <>
    <PageHeading eyebrow="Prática complementar" title={existing ? 'Editar atividade' : 'Criar atividade'} description="Escolha a modalidade, o destino e as condições de entrega." />
    {existing?.updatedAt && <p className="mb-4 text-xs text-slate-500">Última alteração: {db.users.find(u => u.id === existing.updatedBy)?.name ?? 'Equipe AJA'} · {new Date(existing.updatedAt).toLocaleString('pt-BR')}</p>}
    {revision.conflict && existing && <div className="mb-6"><RecordConflict key={existing.revision} author={db.users.find(u => u.id === existing.updatedBy)?.name ?? 'Equipe AJA'} updatedAt={existing.updatedAt} onReviewed={revision.acknowledge}><p><strong>{existing.title}</strong></p><p>{existing.description}</p><p>Prazo: {existing.deadline}</p><p>Módulo: {db.modules.find(m => m.id === existing.moduleId)?.title}</p><p>Questões: {existing.questionIds.map(id => assessmentQuestions(db, existing).find(q => q.id === id)?.statement ?? 'Questão indisponível').join('\n\n')}</p></RecordConflict></div>}
    {structuralLocked && <p className="mb-5 rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-950">Esta atividade já recebeu entrega. Apenas título, orientações e prazo podem mudar.</p>}
    {needsStructureRecovery && existing && <section role="alert" className="mb-6 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
      <p className="font-semibold">A primeira entrega chegou durante sua edição.</p>
      <p>As alterações locais de módulo e questões não podem mais ser salvas. Consulte a estrutura atual para recuperar esses campos. Título, orientações e prazo serão mantidos; questões autorais locais ainda não salvas serão descartadas.</p>
      <Button variant="secondary" onClick={() => setInspectedStructure(structureSignature)}>Consultar estrutura atual</Button>
      {inspectedStructure === structureSignature && <div className="space-y-3 border-t border-amber-200 pt-3">
        <p><strong>Módulo atual:</strong> {db.modules.find(m => m.id === existing.moduleId)?.title ?? 'Módulo indisponível'}</p>
        <ol className="list-decimal space-y-2 pl-5">{existing.questionIds.map(id => <li key={id}>{assessmentQuestions(db, existing).find(q => q.id === id)?.statement ?? 'Questão indisponível'}</li>)}</ol>
        <Button variant="secondary" onClick={() => {
          const restored = restoreAssessmentStructure({ title, description, deadline, moduleId: module, questionIds: ids, originals }, existing);
          setModule(restored.moduleId); setIds(restored.questionIds); setOriginals(restored.originals);
          setKind(existing.kind ?? 'quiz'); setRequired(existing.required !== false); setHasDeadline(!!existing.deadline); setAllowLate(!!existing.allowLate); setGraded(existing.maxGrade !== undefined); setMaxGrade(String(existing.maxGrade ?? 10));
          setStatement(''); setOptions(['', '', '', '', '']); setExplanation(''); setCorrect(0);
          setBank(false); setOriginal(false); setError('');
        }}>Usar estrutura atual e manter meu texto</Button>
      </div>}
    </section>}
    <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="space-y-5">
        <h2 className="font-semibold">Configurações</h2>
        <Select label="Tipo de atividade" value={kind} disabled={structuralLocked} onChange={e => setKind(e.target.value as 'quiz' | 'work')}><option value="quiz">Questionário</option><option value="work">Entrega de trabalho</option></Select>
        <Input label="Título" value={title} onChange={e => setTitle(e.target.value)} required maxLength={150} />
        <Textarea label="Orientações" value={description} onChange={e => setDescription(e.target.value)} />
        <Select label="Módulo da disciplina" value={module} disabled={structuralLocked} onChange={e => setModule(e.target.value)}>
          {availableModules.map(m => <option key={m.id} value={m.id}>{db.subjects.find(s => s.id === m.subjectId)?.name} · {m.title}</option>)}
        </Select>
        <Select label="Obrigatoriedade" value={required ? 'required' : 'optional'} disabled={structuralLocked} onChange={e => setRequired(e.target.value === 'required')}><option value="required">Obrigatória</option><option value="optional">Opcional</option></Select>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={hasDeadline} disabled={structuralLocked} onChange={e => setHasDeadline(e.target.checked)} />Definir prazo</label>
        {hasDeadline ? <><Input label="Prazo de entrega" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /><p className="text-xs text-slate-500">Horário de Brasília (UTC−3).</p><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={allowLate} disabled={structuralLocked} onChange={e => setAllowLate(e.target.checked)} />Aceitar entrega atrasada</label></> : <p className="text-sm text-slate-500">Sem prazo</p>}
        {kind === 'work' && <><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={graded} disabled={structuralLocked} onChange={e => setGraded(e.target.checked)} />Permitir nota opcional</label>{graded && <Input label="Nota máxima" type="number" min="0.01" step="any" disabled={structuralLocked} value={maxGrade} onChange={e => setMaxGrade(e.target.value)} />}</>}
        <p className="text-xs leading-5 text-slate-500">Um único envio por aluno. {kind === 'quiz' ? 'Cada questão vale 1 ponto, com uma alternativa correta. A ordem das questões e alternativas é fixa.' : 'Até 5 arquivos e links no total, até 10 MB por arquivo. Formatos livres; prévia quando suportada e download nos demais.'}</p>
      </Card>
      <div>
        {kind === 'quiz' && <><div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{ids.length} questões selecionadas</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={structuralLocked} onClick={() => setOriginal(true)}><Plus className="size-4" />Questão original</Button>
            <Button disabled={structuralLocked} onClick={() => setBank(true)}>Buscar no banco</Button>
          </div>
        </div>
        <div className="space-y-4">
          {ids.map((id, index) => {
            const q = all.find(q => q.id === id) ?? bankPreview.find(q => q.id === id);
            return q && <Card key={id}>
            <div className="mb-4 flex items-center gap-2">
              <Badge tone="purple">Questão {index + 1}</Badge>
              <Badge>{'origin' in q && q.origin === 'author' ? 'Autoral desta atividade' : 'Acervo'}</Badge>
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
            {q.image && <img src={q.image.src} alt={q.image.alt} className="my-4 max-h-72 max-w-full" />}
            {'explanation' in q && typeof q.explanation === 'string' && <p className="mt-3 text-sm text-slate-500">{q.explanation}</p>}
            <ol className="mt-4 space-y-2">
              {q.options.map((o, i) => <li key={i} className={cn('rounded-lg px-3 py-2 text-sm', 'correct' in q && i === q.correct ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500')}>{String.fromCharCode(65 + i)}. {o}{'correct' in q && i === q.correct && ' ✓'}</li>)}
            </ol>
          </Card>;
          })}
        </div>
        {!ids.length && <Empty title="Monte seu questionário" description="Selecione questões do banco ou escreva uma questão original." action={<Button disabled={structuralLocked} onClick={() => setBank(true)}>Escolher questões</Button>} />}</>}
        {kind === 'work' && <Card><h2 className="font-semibold">Entrega de trabalho</h2><p className="mt-4 text-sm leading-7 text-slate-600">O aluno poderá preparar arquivos e links, conferir os anexos e confirmar uma única entrega. Descreva nas orientações o que deve ser entregue. O retorno será privado, com publicação explícita de comentário e nota opcional.</p></Card>}
        <p role="alert" className="mt-4 text-sm text-rose-600">
          {error}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {existing && <Button variant="danger" loading={busy} disabled={revision.conflict} onClick={async () => { if (window.confirm('Retirar esta atividade? Ela deixará de aparecer para os alunos e não aceitará envios. Os registros anteriores serão preservados para a equipe, sem restauração pela interface.')) { if (await mutate(d => { d.assessments.find(a => a.id === existing.id)!.deletedAt = new Date().toISOString(); }, 'Atividade retirada.', revision.expected)) router.push('/questionarios'); } }}>Retirar atividade</Button>}
          <Button variant="secondary" onClick={() => { if (window.confirm('Descartar alterações não salvas e voltar às atividades?')) router.push('/questionarios'); }}>Cancelar</Button>
          {existing?.status !== 'published' && <Button variant="secondary" loading={busy} disabled={revision.conflict || needsStructureRecovery} onClick={() => void save('draft')}>Salvar rascunho</Button>}
          <Button loading={busy} disabled={revision.conflict || needsStructureRecovery} onClick={() => void save('published')}>{existing?.status === 'published' ? 'Salvar alterações' : 'Revisar publicação'}</Button>
        </div>
      </div>
    </div>
    <Dialog open={review} onClose={() => setReview(false)} title="Conferir atividade">
      <p className="font-semibold">{title}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{description}</p>
      <dl className="my-5 space-y-3 text-sm"><div><dt className="font-semibold">Destino</dt><dd>{db.classes.find(c => c.id === db.subjects.find(s => s.id === db.modules.find(m => m.id === module)?.subjectId)?.classId)?.name} · {db.subjects.find(s => s.id === db.modules.find(m => m.id === module)?.subjectId)?.name} · {db.modules.find(m => m.id === module)?.title}</dd></div><div><dt className="font-semibold">Condições</dt><dd>{kind === 'quiz' ? `Questionário · ${ids.length} questões` : 'Entrega de trabalho'} · {required ? 'Obrigatória' : 'Opcional'} · {hasDeadline ? `${deadline.replace('T', ' ')} (Brasília) · ${allowLate ? 'Aceita atraso' : 'Não aceita atraso'}` : 'Sem prazo'} · Envio único{kind === 'work' && graded && ` · Nota opcional de 0 a ${maxGrade}`}</dd></div></dl>
      <div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" onClick={() => setReview(false)}>Voltar ao editor</Button><Button loading={busy} disabled={revision.conflict || needsStructureRecovery} onClick={() => void save('published')}>{existing?.status === 'published' ? 'Confirmar alterações' : 'Publicar atividade'}</Button></div>
    </Dialog>
    <Dialog open={bank} onClose={() => setBank(false)} title="Adicionar do banco de questões">
      {structuralLocked && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950">A atividade recebeu a primeira entrega. A seleção de questões foi bloqueada. Volte ao editor para manter seu texto e conferir os campos permitidos.</p>}
      {bank && <BankSelector selectedIds={ids} disabled={structuralLocked} onSelect={q => { if (!structuralLocked) { setBankPreview(previous => [...previous.filter(item => item.id !== q.id), q]); setIds(previous => toggleBankSelection(previous, q.id)); } }} />}
      <Button onClick={() => setBank(false)}>{structuralLocked ? 'Voltar ao editor' : `Concluir seleção (${ids.length})`}</Button>
    </Dialog>
    <Dialog open={original} onClose={() => setOriginal(false)} title="Nova questão original">
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        if (structuralLocked) return;
        const id = uid('question');
        setOriginals(old => [...old, {
          id,
          origin: 'author',
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
