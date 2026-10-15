'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2, ChevronUp } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Check, Dialog, Empty, Input, LinkButton, PageHeading, Select, Textarea } from '@/components/ui';
import { cn, uid, textMatch } from '@/lib/utils';
import { DEMO_DATE } from '@/mocks/database';
import { type Question } from '@/models';

export function AssessmentBuilder() {
  const {
    db,
    role,
    mutate,
    busy
  } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const existing = db.assessments.find(a => a.id === params.get('id'));
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [module, setModule] = useState(existing?.moduleId ?? params.get('modulo') ?? 'm1');
  const [deadline, setDeadline] = useState(existing?.deadline ?? '2026-10-20T23:59');
  const [attempts, setAttempts] = useState(existing?.attempts ?? 3);
  const [shuffle, setShuffle] = useState(existing?.shuffle ?? false);
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
  if (role === 'student') return <Empty title="Criação de questionários" description="Escolha o perfil de professor ou administrador para acessar esta área." />;
  if (existing?.status === 'published') return <Empty title="Este questionário já foi publicado" description="O conteúdo publicado é preservado para manter o histórico das tentativas." action={<LinkButton href="/questionarios">Voltar</LinkButton>} />;
  const all = [...db.questions, ...originals];
  const save = async (status: 'draft' | 'published') => {
    setError('');
    if (!title.trim() || !module || !deadline) {
      setError('Preencha título, módulo e prazo.');
      return;
    }
    if (!ids.length) {
      setError('Adicione pelo menos uma questão.');
      return;
    }
    if (attempts < 1 || attempts > 10) {
      setError('Informe de 1 a 10 tentativas.');
      return;
    }
    if (deadline < `${DEMO_DATE}T00:00`) {
      setError('O prazo deve ser posterior à data de referência da demonstração: 05/10/2026.');
      return;
    }
    if (await mutate(d => {
      d.questions.push(...originals);
      const record = {
        id: existing?.id ?? uid('assessment'),
        publishedAt: existing?.publishedAt ?? (status === 'published' ? new Date().toISOString() : undefined),
        title: title.trim(),
        description,
        moduleId: module,
        deadline,
        attempts,
        shuffle,
        questionIds: ids,
        status
      };
      if (existing) d.assessments[d.assessments.findIndex(a => a.id === existing.id)] = record;else d.assessments.push(record);
    }, status === 'published' ? 'Questionário publicado.' : 'Rascunho salvo.')) router.push('/questionarios');
  };
  return <>
    <PageHeading eyebrow="Ensino e avaliação" title={existing ? 'Editar questionário' : 'Criar questionário'} description="Selecione as questões e configure o prazo e as tentativas." />
    <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="space-y-5">
        <h2 className="font-semibold">Configurações</h2>
        <Input label="Título" value={title} onChange={e => setTitle(e.target.value)} required maxLength={150} />
        <Textarea label="Orientações" value={description} onChange={e => setDescription(e.target.value)} />
        <Select label="Módulo da disciplina" value={module} onChange={e => setModule(e.target.value)}>
          {db.modules.map(m => <option key={m.id} value={m.id}>{db.subjects.find(s => s.id === m.subjectId)?.name} · {m.title}</option>)}
        </Select>
        <Input label="Prazo de entrega" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
        <Input label="Máximo de tentativas" type="number" min={1} max={10} value={attempts} onChange={e => setAttempts(Number(e.target.value))} />
        <Check label="Embaralhar a ordem das questões" checked={shuffle} onChange={setShuffle} />
        <p className="text-xs leading-5 text-slate-400">Cada questão vale 1 ponto. Uma única alternativa correta.</p>
      </Card>
      <div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{ids.length} questões selecionadas</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setOriginal(true)}><Plus className="size-4" />Questão original</Button>
            <Button onClick={() => setBank(true)}>Buscar no banco</Button>
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
                <Button variant="ghost" disabled={index === 0} aria-label={`Mover questão ${index + 1} para cima`} onClick={() => setIds(previous => {
                    const copy = [...previous];
                    [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
                    return copy;
                  })}>
                  <ChevronUp className="size-4" />
                </Button>
                <Button variant="ghost" aria-label={`Remover questão ${index + 1}`} onClick={() => setIds(previous => previous.filter(qid => qid !== id))}>
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
        {!ids.length && <Empty title="Monte seu questionário" description="Selecione questões do banco ou escreva uma questão original." action={<Button onClick={() => setBank(true)}>Escolher questões</Button>} />}
        <p role="alert" className="mt-4 text-sm text-rose-600">
          {error}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <LinkButton secondary href="/questionarios">Cancelar</LinkButton>
          <Button variant="secondary" loading={busy} onClick={() => void save('draft')}>Salvar rascunho</Button>
          <Button loading={busy} onClick={() => void save('published')}>Publicar questionário</Button>
        </div>
      </div>
    </div>
    <Dialog open={bank} onClose={() => setBank(false)} title="Adicionar do banco de questões">
      <Input aria-label="Buscar questões" placeholder="Buscar por tema ou enunciado…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="my-4 max-h-80 space-y-3 overflow-y-auto">
        {db.questions.filter(q => textMatch(q.statement + ' ' + q.topic, search)).map(q => <label key={q.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
          <input className="mt-1 accent-brand-600" type="checkbox" checked={ids.includes(q.id)} onChange={e => setIds(previous => e.target.checked ? [...previous, q.id] : previous.filter(id => id !== q.id))} />
          <span className="text-sm leading-6">
            <span className="block text-xs text-brand-600">{q.subject} · {q.topic}</span>
            {q.statement}
          </span>
        </label>)}
      </div>
      <Button onClick={() => setBank(false)}>Concluir seleção ({ids.length})</Button>
    </Dialog>
    <Dialog open={original} onClose={() => setOriginal(false)} title="Nova questão original">
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
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
        <Textarea label="Enunciado" value={statement} onChange={e => setStatement(e.target.value)} required />
        {options.map((o, i) => <Input key={i} label={`Alternativa ${String.fromCharCode(65 + i)}`} value={o} onChange={e => setOptions(old => old.map((v, j) => j === i ? e.target.value : v))} required />)}
        <Select label="Alternativa correta" value={correct} onChange={e => setCorrect(Number(e.target.value))}>
          {options.map((_, i) => <option key={i} value={i}>
            {String.fromCharCode(65 + i)}
          </option>)}
        </Select>
        <Textarea label="Explicação do gabarito" value={explanation} onChange={e => setExplanation(e.target.value)} required />
        <Button type="submit">Adicionar questão</Button>
      </form>
    </Dialog>
  </>;
}
