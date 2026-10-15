'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ResponsiveDisclosure } from '@/components/ui/responsive-disclosure';
import { Filter } from 'lucide-react';
import { useApp } from '@/components/providers';
import { Badge, Button, Card, Dialog, Empty, Input, PageHeading, Select } from '@/components/ui';
import { cn, difficultyLabels, textMatch } from '@/lib/utils';
import type { Question } from '@/models';
export function QuestionBank() {
  const {
    db
  } = useApp();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('busca') ?? '');
  const queryText = params.get('busca') ?? '';
  useEffect(() => setSearch(queryText), [queryText]);
  const [subject, setSubject] = useState('all');
  const [topic, setTopic] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [institution, setInstitution] = useState('all');
  const [selected, setSelected] = useState<Question | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const items = db.questions.filter(q => (subject === 'all' || q.subject === subject) && (topic === 'all' || q.topic === topic) && (difficulty === 'all' || q.difficulty === difficulty) && (institution === 'all' || q.institution === institution) && textMatch(q.statement + ' ' + q.topic, search));
  const pages = Math.max(1, Math.ceil(items.length / 5));
  const current = Math.min(page, pages);
  const reset = () => {
    setSubject('all');
    setTopic('all');
    setDifficulty('all');
    setInstitution('all');
    setSearch('');
    setPage(1);
  };
  return <>
    <PageHeading title="Banco de questões" description="Busque questões por disciplina, assunto e dificuldade." action={<Badge tone="purple">{db.questions.length} questões autorais de exemplo</Badge>} />
    <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <Card className="!p-5">
        <ResponsiveDisclosure breakpoint="lg" title={<><Filter aria-hidden="true" className="size-4" />Filtros{[subject, topic, difficulty, institution].some(value => value !== 'all') && <Badge tone="purple">Ativos</Badge>}</>}><div className="space-y-5">
        <Select label="Matéria" value={subject} onChange={e => {
          setSubject(e.target.value);
          setTopic('all');
          setPage(1);
        }}>
          <option value="all">Todas as matérias</option>
          {[...new Set(db.questions.map(q => q.subject))].map(s => <option key={s}>
            {s}
          </option>)}
        </Select>
        <Select label="Tema" value={topic} onChange={e => {
          setTopic(e.target.value);
          setPage(1);
        }}>
          <option value="all">Todos os temas</option>
          {[...new Set(db.questions.filter(q => subject === 'all' || q.subject === subject).map(q => q.topic))].map(t => <option key={t}>
            {t}
          </option>)}
        </Select>
        <Select label="Dificuldade" value={difficulty} onChange={e => {
          setDifficulty(e.target.value);
          setPage(1);
        }}>
          <option value="all">Todas</option>
          <option value="easy">Fácil</option>
          <option value="medium">Média</option>
          <option value="hard">Difícil</option>
        </Select>
        <Select label="Instituição" value={institution} onChange={e => setInstitution(e.target.value)}>
          <option value="all">Todas</option>
          <option>AJA</option>
        </Select>
        <Button variant="ghost" onClick={reset} className="w-full">Limpar filtros</Button>
        </div></ResponsiveDisclosure>
      </Card>
      <div>
        <Input aria-label="Buscar questão" placeholder="Busque por palavras do enunciado ou tema…" value={search} onChange={e => {
          setSearch(e.target.value);
          setPage(1);
        }} />
        <p className="my-4 text-sm text-slate-400">
          {items.length}
          {items.length === 1 ? ' questão encontrada' : ' questões encontradas'}
        </p>
        <div className="space-y-4">
          {items.slice((current - 1) * 5, current * 5).map(q => <Card key={q.id}>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge tone="purple">
                {q.subject}
              </Badge>
              <Badge>
                {q.topic}
              </Badge>
              <Badge tone={q.difficulty === 'hard' ? 'amber' : q.difficulty === 'easy' ? 'green' : 'blue'}>
                {difficultyLabels[q.difficulty]}
              </Badge>
              <span className="ml-auto text-xs text-slate-400">{q.institution} · {q.year} · {q.id.toUpperCase()}</span>
            </div>
            <p className="leading-7">
              {q.statement}
            </p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">{q.options.length} alternativas · Resposta única</span>
              <Button variant="secondary" onClick={() => {
                setSelected(q);
                setShowAnswer(false);
                setAnswer(null);
              }}>Ver questão</Button>
            </div>
          </Card>)}
        </div>
        {!items.length && <Empty title="Nenhuma questão com estes filtros" description="Experimente ampliar a busca ou limpar os filtros." action={<Button onClick={reset}>Limpar filtros</Button>} />}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Anterior</Button>
          <span className="text-sm text-slate-500">{current} / {pages}</span>
          <Button variant="secondary" disabled={current === pages} onClick={() => setPage(current + 1)}>Próxima</Button>
        </div>
      </div>
    </div>
    <Dialog open={!!selected} onClose={() => setSelected(null)} title="Explorar questão">
      {selected && <>
        <div className="mb-4 flex gap-2">
          <Badge tone="purple">
            {selected.subject}
          </Badge>
          <Badge>
            {selected.topic}
          </Badge>
        </div>
        <p className="mb-5 leading-7">
          {selected.statement}
        </p>
        <div className="space-y-2" role="radiogroup" aria-label="Alternativas">
          {selected.options.map((option, index) => <label key={option} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-6', answer === index ? 'border-brand-500 bg-brand-50' : 'border-slate-200', showAnswer && index === selected.correct && '!border-emerald-500 !bg-emerald-50')}>
            <input className="mt-1 accent-brand-600" type="radio" name="practice" checked={answer === index} onChange={() => setAnswer(index)} disabled={showAnswer} />
            <span>
              <strong className="mr-2">{String.fromCharCode(65 + index)}.</strong>
              {option}
            </span>
          </label>)}
        </div>
        {showAnswer ? <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm leading-6">
          <strong>
            {answer === selected.correct ? 'Você acertou!' : 'Vamos entender a resolução.'}
          </strong>
          <p className="mt-1">
            {selected.explanation}
          </p>
        </div> : <Button className="mt-5" onClick={() => setShowAnswer(true)}>Conferir resolução</Button>}
        <Link href={`/forum?questao=${selected.id}`} className="mt-4 block text-sm font-semibold text-brand-600">Discutir esta questão no fórum</Link>
      </>}
    </Dialog>
  </>;
}
