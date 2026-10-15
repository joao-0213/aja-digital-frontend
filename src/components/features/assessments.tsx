'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardCheck, Plus, Clock3, CheckCircle2, Trophy, Trash2, ChevronUp } from 'lucide-react';
import { PublicationDate } from '@/components/ui/publication-date';
import { useApp } from '@/components/providers';
import { Badge, Button, Card, Check, Dialog, Empty, Input, LinkButton, PageHeading, ProgressBar, Select, Textarea } from '@/components/ui';
import { cn, dateLabel, percent, uid, textMatch } from '@/lib/utils';
import { DEMO_DATE } from '@/mocks/database';
import { gradeAttempt } from '@/lib/domain';
import type { Attempt, Question } from '@/models';
export function AssessmentsPage() {
  const {
    db,
    user,
    role
  } = useApp();
  const [filter, setFilter] = useState('all');
  const items = db.assessments.filter(a => (role !== 'student' || a.status === 'published') && (filter === 'all' || (filter === 'done' ? db.attempts.some(t => t.assessmentId === a.id && t.userId === user.id && t.submittedAt) : !db.attempts.some(t => t.assessmentId === a.id && t.userId === user.id && t.submittedAt))));
  return <>
    <PageHeading title="Questionários" description="Consulte os prazos, responda às atividades e veja seus resultados." action={role !== 'student' && <LinkButton href="/questionarios/criar"><Plus className="size-4" />Criar questionário</LinkButton>} />
    <div role="group" aria-label="Filtrar questionários" className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {[['all', 'Todos'], ['pending', 'Para fazer'], ['done', 'Respondidos']].map(([id, label]) => <Button key={id} variant="ghost" aria-pressed={filter === id} className={filter === id ? 'bg-brand-100 !text-brand-700' : undefined} onClick={() => setFilter(id)}>
        {label}
      </Button>)}
    </div>
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.map(a => {
        const mod = db.modules.find(m => m.id === a.moduleId);
        const sub = db.subjects.find(s => s.id === mod?.subjectId);
        const attempts = db.attempts.filter(t => t.assessmentId === a.id && t.userId === user.id && t.submittedAt);
        const last = attempts.at(-1);
        return <Card key={a.id} className="flex flex-col">
        <div className="mb-5 flex items-center justify-between">
          <ClipboardCheck aria-hidden="true" className="size-5 text-slate-500" />
          <Badge tone={a.status === 'draft' ? 'neutral' : last ? 'green' : 'amber'}>
            {a.status === 'draft' ? 'Rascunho' : last ? 'Respondido' : 'Disponível'}
          </Badge>
        </div>
        <p className="text-xs text-slate-400">{sub?.name} · Módulo {mod?.order}</p>
        <h2 className="mb-2 mt-2 text-lg font-semibold">
          {a.title}
        </h2>
        <p className="mb-5 flex-1 text-sm leading-6 text-slate-500">
          {a.description}
        </p>
        <div className="mb-5 space-y-2 text-sm text-slate-500">
          <p>{a.questionIds.length} {a.questionIds.length === 1 ? 'questão' : 'questões'} · {a.attempts} {a.attempts === 1 ? 'tentativa' : 'tentativas'}</p>
          <p className="text-xs text-slate-500"><PublicationDate value={a.publishedAt} /></p>
          <p className="flex items-center gap-2"><Clock3 className="size-4" />Até {dateLabel(a.deadline)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.status === 'draft' ? <LinkButton secondary href={`/questionarios/criar?id=${a.id}`}>Editar rascunho</LinkButton> : <LinkButton href={`/questionarios/responder?id=${a.id}`}>
            {last ? 'Ver tentativas' : 'Começar'}
          </LinkButton>}
          {last && <LinkButton secondary href={`/questionarios/resultado?id=${last.id}`}>Resultado</LinkButton>}
        </div>
      </Card>;
      })}
    </div>
    {!items.length && <Empty title="Nenhum questionário nesta lista" description="Suas atividades aparecerão aqui quando estiverem disponíveis." />}
  </>;
}
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
export function AnswerAssessment() {
  const {
    db,
    user,
    mutate,
    busy
  } = useApp();
  const id = useSearchParams().get('id') ?? 'a1';
  const a = db.assessments.find(item => item.id === id);
  const attempts = db.attempts.filter(t => t.assessmentId === id && t.userId === user.id);
  const active = attempts.find(t => !t.submittedAt);
  const router = useRouter();
  if (!a || a.status !== 'published') return <Empty title="Questionário indisponível" action={<LinkButton href="/questionarios">Ver questionários</LinkButton>} />;
  if (active) return <QuizSession key={active.id} attempt={active} />;
  const completed = attempts.filter(t => t.submittedAt);
  const expired = a.deadline < `${DEMO_DATE}T00:00`;
  const exhausted = completed.length >= a.attempts;
  return <div className="mx-auto max-w-2xl">
    <PageHeading eyebrow="Questionário" title={a.title} description={a.description} />
    <Card>
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone="purple">{a.questionIds.length} questões</Badge>
        <Badge>{a.attempts} tentativas</Badge>
        <Badge tone="amber">Até {dateLabel(a.deadline)}</Badge>
      </div>
      <h2 className="font-semibold">Antes de começar</h2>
      <ul className="my-5 list-disc space-y-3 pl-5 text-sm leading-6 text-slate-500">
        <li>Cada questão tem uma alternativa correta e vale 1 ponto.</li>
        <li>Você pode navegar entre as questões e revisar antes de enviar.</li>
        <li>Suas respostas são salvas automaticamente neste navegador.</li>
        <li>Data de referência desta demonstração: 05/10/2026.</li>
      </ul>
      {completed.length > 0 && <div className="mb-6 border-t border-slate-100 pt-5">
        <h3 className="mb-3 text-sm font-semibold">Tentativas anteriores</h3>
        {completed.map((t, i) => <Link key={t.id} href={`/questionarios/resultado?id=${t.id}`} className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
          <span>Tentativa {i + 1}</span>
          <span className="font-semibold text-brand-600">Ver resultado</span>
        </Link>)}
      </div>}
      <Button className="w-full" disabled={exhausted || expired} loading={busy} onClick={() => void mutate(d => {
        if (d.attempts.some(t => t.assessmentId === id && t.userId === user.id && !t.submittedAt)) return;
        const order = [...a.questionIds];
        if (a.shuffle) for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        d.attempts.push({
          id: uid('attempt'),
          assessmentId: id,
          userId: user.id,
          startedAt: new Date().toISOString(),
          answers: {},
          questionOrder: order
        });
      })}>
        {exhausted ? 'Limite de tentativas atingido' : expired ? 'Prazo encerrado' : completed.length ? 'Iniciar nova tentativa' : 'Iniciar questionário'}
      </Button>
      <p className="mt-3 text-center text-xs text-slate-400">{completed.length} de {a.attempts} tentativas utilizadas</p>
    </Card>
  </div>;
}
function QuizSession({
  attempt
}: {
  attempt: Attempt;
}) {
  const {
    db,
    mutate,
    busy
  } = useApp();
  const router = useRouter();
  const recoveryKey = `aja-attempt-${attempt.id}`;
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') try {
      const raw = sessionStorage.getItem(recoveryKey);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const entries = Object.entries(value).filter(([id, index]) => attempt.questionOrder.includes(id) && typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < (db.questions.find(q => q.id === id)?.options.length ?? 0));
          return Object.fromEntries(entries) as Record<string, number>;
        }
      }
    } catch {}
    return attempt.answers;
  });
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [retry, setRetry] = useState(0);
  const a = db.assessments.find(a => a.id === attempt.assessmentId)!;
  const question = db.questions.find(q => q.id === attempt.questionOrder[index])!;
  useEffect(() => {
    try {
      sessionStorage.setItem(recoveryKey, JSON.stringify(answers));
    } catch {}
    setSaveStatus('saving');
    let cancelled = false;
    const timer = setTimeout(() => {
      void mutate(d => {
        const item = d.attempts.find(t => t.id === attempt.id);
        if (item && !item.submittedAt) item.answers = {
          ...answers
        };
      }).then(ok => {
        if (!cancelled) setSaveStatus(ok ? 'saved' : 'error');
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [answers, attempt.id, mutate, retry, recoveryKey]);
  const submit = async () => {
    const ok = await mutate(d => {
      const item = d.attempts.find(t => t.id === attempt.id);
      if (item) {
        item.answers = {
          ...answers
        };
        item.submittedAt = new Date().toISOString();
      }
    }, 'Questionário enviado.');
    if (ok) {
      try {
        sessionStorage.removeItem(recoveryKey);
      } catch {}
      router.push(`/questionarios/resultado?id=${attempt.id}`);
    }
  };
  return <div className="mx-auto max-w-4xl">
    <PageHeading eyebrow="Questionário" title={a.title} action={<Badge tone={saveStatus === 'error' ? 'red' : 'neutral'}>
        {saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'error' ? 'Falha ao salvar' : 'Salvo neste navegador'}
      </Badge>} />
    {saveStatus === 'error' && <Button variant="secondary" className="mb-4" onClick={() => setRetry(n => n + 1)}>Tentar salvar novamente</Button>}
    <div className="mb-3 flex justify-between text-sm text-slate-500">
      <span>Questão {index + 1} de {attempt.questionOrder.length}</span>
      <span>{Object.keys(answers).length} respondidas</span>
    </div>
    <ProgressBar label="Questões respondidas" value={percent(Object.keys(answers).length, attempt.questionOrder.length)} />
    <div className="my-6 flex flex-wrap gap-2" aria-label="Navegação entre questões">
      {attempt.questionOrder.map((id, i) => <Button key={id} variant={index === i ? 'primary' : 'secondary'} aria-label={`Questão ${i + 1}${answers[id] !== undefined ? ', respondida' : ''}`} onClick={() => setIndex(i)} className={cn('!min-h-10 !px-3', index !== i && answers[id] !== undefined && '!border-emerald-300 !bg-emerald-50 !text-emerald-700')}>
        {i + 1}
        {answers[id] !== undefined && <CheckCircle2 className="size-3" />}
      </Button>)}
    </div>
    <Card>
      <Badge tone="purple">
        {question.topic}
      </Badge>
      <h2 className="mb-7 mt-5 text-lg font-semibold leading-8">
        {question.statement}
      </h2>
      <fieldset className="space-y-3">
        <legend className="sr-only">Escolha uma alternativa</legend>
        {question.options.map((option, i) => <label key={i} className={cn('flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition hover:border-brand-200', answers[question.id] === i ? 'border-brand-500 bg-brand-50' : 'border-slate-200')}>
          <input type="radio" name={question.id} checked={answers[question.id] === i} onChange={() => setAnswers(old => ({
            ...old,
            [question.id]: i
          }))} className="mt-1 size-4 accent-brand-600" />
          <span className="text-base leading-6">
            <strong className="mr-3 text-slate-500">{String.fromCharCode(65 + i)}.</strong>
            {option}
          </span>
        </label>)}
      </fieldset>
      <Button variant="ghost" className="mt-3" disabled={answers[question.id] === undefined} onClick={() => setAnswers(old => {
        const next = {
          ...old
        };
        delete next[question.id];
        return next;
      })}>Limpar resposta</Button>
    </Card>
    <div className="mt-6 flex flex-wrap justify-between gap-3">
      <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>Questão anterior</Button>
      {index < attempt.questionOrder.length - 1 ? <Button onClick={() => setIndex(i => i + 1)}>Próxima questão</Button> : <Button onClick={() => setConfirm(true)}>Revisar e enviar</Button>}
    </div>
    <Dialog open={confirm} onClose={() => setConfirm(false)} title="Enviar suas respostas?">
      <p className="mb-5 leading-7 text-slate-500">Você respondeu {Object.keys(answers).length} de {attempt.questionOrder.length} questões. Após o envio, esta tentativa não poderá ser alterada.</p>
      {Object.keys(answers).length < attempt.questionOrder.length && <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Há {attempt.questionOrder.length - Object.keys(answers).length} questões em branco. Elas não receberão pontos.</p>}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => setConfirm(false)}>Revisar</Button>
        <Button loading={busy} onClick={() => void submit()}>Confirmar envio</Button>
      </div>
    </Dialog>
  </div>;
}
export function AssessmentResult() {
  const {
    db,
    user
  } = useApp();
  const id = useSearchParams().get('id');
  const attempt = db.attempts.find(t => t.id === id && t.userId === user.id && t.submittedAt);
  if (!attempt) return <Empty title="Resultado não encontrado" description="Conclua um questionário para ver seu desempenho." action={<LinkButton href="/questionarios">Ver questionários</LinkButton>} />;
  const a = db.assessments.find(a => a.id === attempt.assessmentId)!;
  const {
    correct
  } = gradeAttempt(attempt.questionOrder, attempt.answers, db.questions);
  return <div className="mx-auto max-w-3xl">
    <PageHeading eyebrow="Questionário" title="Resultado" description={a.title} />
    <Card className="mb-6 text-center">
      <Trophy className="mx-auto mb-4 size-10 text-brand-500" />
      <p className="text-5xl font-bold text-brand-700">
        {percent(correct, attempt.questionOrder.length)}
        <span className="text-2xl">%</span>
      </p>
      <p className="mt-3 text-slate-500">{correct} de {attempt.questionOrder.length} questões corretas</p>
      <p className="mt-2 text-sm text-slate-400">Confira suas respostas e o gabarito abaixo.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <LinkButton href={`/questionarios/responder?id=${a.id}`}>Ver tentativas</LinkButton>
        <LinkButton secondary href="/disciplinas">Voltar aos estudos</LinkButton>
      </div>
    </Card>
    <h2 className="mb-4 text-lg font-semibold">Vamos revisar?</h2>
    <div className="space-y-4">
      {attempt.questionOrder.map((id, index) => {
        const q = db.questions.find(q => q.id === id)!;
        const right = attempt.answers[id] === q.correct;
        return <Card key={id}>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold">Questão {index + 1}</span>
          <Badge tone={right ? 'green' : 'amber'}>
            {right ? 'Correta' : attempt.answers[id] === undefined ? 'Em branco' : 'Revisar'}
          </Badge>
        </div>
        <p className="leading-7">
          {q.statement}
        </p>
        <p className="mt-4 text-sm text-slate-500">Sua resposta: {attempt.answers[id] === undefined ? 'Não respondida' : q.options[attempt.answers[id]]}</p>
        <p className="mt-2 text-sm font-semibold text-emerald-700">Resposta correta: {q.options[q.correct]}</p>
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          {q.explanation}
        </p>
      </Card>;
      })}
    </div>
  </div>;
}
