'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ResponsiveDisclosure } from '@/components/ui/responsive-disclosure';
import { QuestionFilters } from './question-filters';
import { emptyQuestionFilters, filterQuestions } from '../lib/question-filters';
import { Filter } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Dialog, Empty, PageHeading } from '@/components/ui';
import { cn, difficultyLabels } from '@/lib/utils';

export function QuestionBank() {
  const {
    db, notify
  } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const [filters, setFilters] = useState({ ...emptyQuestionFilters, search: params.get('busca') ?? '' });
  const queryText = params.get('busca') ?? '';
  useEffect(() => { setFilters(previous => ({ ...previous, search: queryText })); setPage(1); }, [queryText]);
  const questionId = params.get('id');
  const selected = db.questions.find(q => q.id === questionId) ?? null;
  const [showAnswer, setShowAnswer] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { setShowAnswer(false); setAnswer(null); }, [questionId]);
  const items = filterQuestions(db.questions, filters);
  const pages = Math.max(1, Math.ceil(items.length / 5));
  const current = Math.min(page, pages);
  const reset = () => { setFilters(emptyQuestionFilters); setPage(1); };
  return <>
    <PageHeading title="Banco de questões" description="Busque questões por disciplina, assunto e dificuldade." action={<Badge tone="purple">{db.questions.length} questões autorais de exemplo</Badge>} />
    <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <Card className="!p-5">
        <ResponsiveDisclosure breakpoint="lg" title={<><Filter aria-hidden="true" className="size-4" />Filtros</>}><QuestionFilters questions={db.questions} value={filters} onChange={next => { setFilters(next); setPage(1); }} /></ResponsiveDisclosure>
      </Card>
      <div>
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
              <Button variant="secondary" onClick={() => router.push(`/questoes?id=${encodeURIComponent(q.id)}`, { scroll: false })}>Ver questão</Button>
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
    {questionId && !selected && <Empty title="Questão indisponível" description="A referência não existe no acervo ou foi retirada." action={<Button onClick={() => router.push('/questoes')}>Voltar ao banco</Button>} />}
    <Dialog open={!!selected} onClose={() => router.push('/questoes', { scroll: false })} title="Explorar questão">
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
        {selected.image && <img src={selected.image.src} alt={selected.image.alt} className="my-4 max-h-80 max-w-full" />}
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
        <Button variant="secondary" className="mt-4" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/questoes?id=${encodeURIComponent(selected.id)}`); notify('Link da questão copiado.'); } catch { notify('Não foi possível copiar. Copie o endereço da barra do navegador.', true); } }}>Copiar link da questão</Button>
        <Link href={`/forum?questao=${selected.id}`} className="mt-4 block text-sm font-semibold text-brand-600">Discutir esta questão no fórum</Link>
      </>}
    </Dialog>
  </>;
}
