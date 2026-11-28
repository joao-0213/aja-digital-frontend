'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, PanelLeftOpen, X } from 'lucide-react';
import { AuthenticatedImage } from '@/components/shared/authenticated-image';
import { useApp, useSession } from '@/providers/app-context';
import { useHttpQuery } from '@/hooks/use-http-query';
import { HttpError } from '@/lib/http-client';
import {
  Badge,
  Button,
  Dialog,
  Empty,
  ErrorState,
  LinkButton,
  PageHeading,
  Pagination,
  Skeleton
} from '@/components/ui';
import { cn, countLabel } from '@/lib/utils';
import { difficultyLabels } from '@/lib/labels';
import type { BankQuestion, PracticeResult } from '../api';
import { questionKeys, useQuestionsApi } from '../hooks/use-questions';
import { emptyQuestionFilters, type QuestionFilterValue } from '../lib/question-filters';
import { countActiveQuestionFilters, QuestionFilters } from './question-filters';
import { QuestionPicker } from './question-picker';
import { toErrorMessage } from '@/lib/errors';

const fields = {
  search: 'busca',
  subject: 'subject',
  topic: 'topic',
  difficulty: 'difficulty',
  institution: 'institution',
  year: 'year'
} as const;

export function QuestionBank() {
  const { client, sessionKey } = useSession();
  const { notify } = useApp();
  const router = useRouter(),
    params = useSearchParams();
  const api = useQuestionsApi();
  const filters: Required<QuestionFilterValue> = {
    search: params.get('busca') ?? emptyQuestionFilters.search,
    subject: params.get('subject') ?? emptyQuestionFilters.subject,
    topic: params.get('topic') ?? emptyQuestionFilters.topic,
    difficulty: params.get('difficulty') ?? emptyQuestionFilters.difficulty,
    institution: params.get('institution') ?? emptyQuestionFilters.institution,
    year: params.get('year') ?? emptyQuestionFilters.year
  };
  const page = Math.max(1, Number(params.get('page')) || 1),
    id = params.get('id');
  const identity = `${sessionKey}:${id}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const filterKey = JSON.stringify(filters);
  const changeUrl = (updates: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates))
      value ? next.set(key, value) : next.delete(key);
    const url = `/questoes${next.size ? `?${next}` : ''}`;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  };
  const changeFilters = (next: QuestionFilterValue) => {
    const normalized: Required<QuestionFilterValue> = { ...emptyQuestionFilters, ...next };
    changeUrl(
      {
        ...Object.fromEntries(
          Object.entries(fields).map(([key, name]) => [
            name,
            normalized[key as keyof Required<QuestionFilterValue>] ===
            emptyQuestionFilters[key as keyof Required<QuestionFilterValue>]
              ? null
              : normalized[key as keyof Required<QuestionFilterValue>]
          ])
        ),
        page: null
      },
      true
    );
  };
  const list = useHttpQuery(
    { sessionKey, key: questionKeys.list(filters, page) },
    useCallback(
      (signal) => api.list(JSON.parse(filterKey) as QuestionFilterValue, page, signal),
      [api, filterKey, page]
    ),
    { keepPreviousData: true }
  );
  const options = useHttpQuery(
    { sessionKey, key: questionKeys.options },
    useCallback(
      (signal) => api.listOptions(signal, () => client.getSnapshot().sessionKey === sessionKey),
      [api, client, sessionKey]
    )
  );
  const detail = useHttpQuery(
    { sessionKey, key: questionKeys.detail(id) },
    useCallback((signal) => api.read(id ?? '', signal), [api, id]),
    !!id
  );
  const [answer, setAnswer] = useState<number | null>(null),
    [result, setResult] = useState<PracticeResult | null>(null),
    [pending, setPending] = useState(false),
    [practiceError, setPracticeError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const activeFilterCount = countActiveQuestionFilters(filters);
  // biome-ignore lint/correctness/useExhaustiveDependencies: practice state resets whenever the question or session changes
  useEffect(() => {
    setAnswer(null);
    setResult(null);
    setPending(false);
    setPracticeError('');
  }, [id, sessionKey]);
  const practice = async () => {
    if (!id || answer === null || pending) return;
    const generation = client.getSnapshot(),
      startedIdentity = identity;
    setPending(true);
    setPracticeError('');
    try {
      const value = await api.practice(id, answer);
      if (
        currentIdentity.current === startedIdentity &&
        client.getSnapshot().sessionKey === generation.sessionKey &&
        client.getSnapshot().resourceEpoch === generation.resourceEpoch
      )
        setResult(value);
    } catch (error) {
      if (
        currentIdentity.current === startedIdentity &&
        client.getSnapshot().sessionKey === generation.sessionKey &&
        client.getSnapshot().resourceEpoch === generation.resourceEpoch
      )
        setPracticeError(toErrorMessage(error, 'Não foi possível conferir a resolução.'));
    } finally {
      if (
        currentIdentity.current === startedIdentity &&
        client.getSnapshot().sessionKey === generation.sessionKey &&
        client.getSnapshot().resourceEpoch === generation.resourceEpoch
      )
        setPending(false);
    }
  };
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 5));
  return (
    <>
      <LinkButton secondary href="/" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar ao painel
      </LinkButton>
      <PageHeading
        title="Banco de questões"
        action={
          !filtersOpen && (
            <Button variant="secondary" onClick={() => setFiltersOpen(true)}>
              <PanelLeftOpen aria-hidden="true" className="size-4" />
              Mostrar filtros
              {activeFilterCount > 0 && (
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 tabular-nums">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          )
        }
      />
      <div
        className={cn(
          'grid items-start gap-6',
          filtersOpen && 'lg:grid-cols-[272px_minmax(0,1fr)]'
        )}
      >
        {filtersOpen &&
          (options.error ? (
            <ErrorState message={options.error.message} retry={() => void options.retry()} />
          ) : (
            <QuestionFilters
              questions={options.data ?? []}
              value={filters}
              onChange={changeFilters}
              onCollapse={() => setFiltersOpen(false)}
            />
          ))}
        <div className="min-w-0">
          {list.loading ? (
            <Skeleton />
          ) : list.error ? (
            <ErrorState message={list.error.message} retry={() => void list.retry()} />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-500">
                  {countLabel(list.data?.total ?? 0, 'questão encontrada', 'questões encontradas')}
                </p>
                {activeFilterCount > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {filters.subject !== 'all' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-900">
                        <span>{filters.subject}</span>
                        <button
                          type="button"
                          aria-label={`Remover filtro ${filters.subject}`}
                          onClick={() =>
                            changeFilters({ ...filters, subject: 'all', topic: 'all' })
                          }
                          className="inline-flex size-4 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200/70"
                        >
                          <X aria-hidden="true" className="size-3" />
                        </button>
                      </span>
                    )}
                    {filters.topic !== 'all' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-900">
                        <span>{filters.topic}</span>
                        <button
                          type="button"
                          aria-label={`Remover filtro ${filters.topic}`}
                          onClick={() => changeFilters({ ...filters, topic: 'all' })}
                          className="inline-flex size-4 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200/70"
                        >
                          <X aria-hidden="true" className="size-3" />
                        </button>
                      </span>
                    )}
                    {filters.difficulty !== 'all' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-900">
                        <span>
                          {difficultyLabels[filters.difficulty as keyof typeof difficultyLabels] ??
                            filters.difficulty}
                        </span>
                        <button
                          type="button"
                          aria-label="Remover filtro de dificuldade"
                          onClick={() => changeFilters({ ...filters, difficulty: 'all' })}
                          className="inline-flex size-4 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200/70"
                        >
                          <X aria-hidden="true" className="size-3" />
                        </button>
                      </span>
                    )}
                    {filters.institution !== 'all' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-900">
                        <span>{filters.institution}</span>
                        <button
                          type="button"
                          aria-label={`Remover filtro ${filters.institution}`}
                          onClick={() => changeFilters({ ...filters, institution: 'all' })}
                          className="inline-flex size-4 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200/70"
                        >
                          <X aria-hidden="true" className="size-3" />
                        </button>
                      </span>
                    )}
                    {(filters.year ?? 'all') !== 'all' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-900">
                        <span>{filters.year}</span>
                        <button
                          type="button"
                          aria-label={`Remover filtro ${filters.year}`}
                          onClick={() => changeFilters({ ...filters, year: 'all' })}
                          className="inline-flex size-4 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200/70"
                        >
                          <X aria-hidden="true" className="size-3" />
                        </button>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => changeFilters(emptyQuestionFilters)}
                      className="px-1.5 text-xs font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                    >
                      Limpar
                    </button>
                  </div>
                )}
              </div>
              <QuestionPicker
                items={list.data?.items ?? []}
                onSelect={(q) => changeUrl({ id: q.id })}
              />
              {!list.data?.items.length && (
                <Empty
                  title="Nenhuma questão com estes filtros"
                  description="Experimente ampliar a busca ou limpar os filtros."
                  action={
                    <Button onClick={() => changeFilters(emptyQuestionFilters)}>
                      Limpar filtros
                    </Button>
                  }
                />
              )}
              <Pagination
                page={page}
                totalPages={pages}
                onPageChange={(nextPage) => changeUrl({ page: String(nextPage) })}
              />
            </>
          )}
        </div>
      </div>
      <Dialog open={!!id} onClose={() => changeUrl({ id: null })} title="Explorar questão">
        {detail.loading ? (
          <Skeleton />
        ) : detail.error ? (
          detail.error instanceof HttpError && detail.error.kind === 'not-found' ? (
            <Empty
              title="Questão indisponível"
              description="A referência não existe no acervo ou foi retirada."
              action={<Button onClick={() => changeUrl({ id: null })}>Voltar ao banco</Button>}
            />
          ) : (
            <ErrorState message={detail.error.message} retry={() => void detail.retry()} />
          )
        ) : (
          detail.data && (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge tone="purple">{detail.data.subject}</Badge>
                <Badge>{detail.data.topic}</Badge>
              </div>
              <p className="mb-5 leading-7 [overflow-wrap:anywhere]">{detail.data.statement}</p>
              {detail.data.image && <AuthenticatedImage image={detail.data.image} />}
              <div className="space-y-2" role="radiogroup" aria-label="Alternativas">
                {detail.data.options.map((option, index) => (
                  <label
                    key={index}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-6',
                      answer === index ? 'border-brand-500 bg-brand-50' : 'border-slate-200',
                      result && index === result.correct && '!border-emerald-500 !bg-emerald-50'
                    )}
                  >
                    <input
                      className="mt-1 shrink-0 accent-brand-600"
                      type="radio"
                      name="practice"
                      checked={answer === index}
                      onChange={() => setAnswer(index)}
                      disabled={!!result || pending}
                    />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <strong className="mr-2">{String.fromCharCode(65 + index)}.</strong>
                      {option}
                    </span>
                  </label>
                ))}
              </div>
              {result ? (
                <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm leading-6 [overflow-wrap:anywhere]">
                  <strong>
                    {result.isCorrect ? 'Você acertou!' : 'Vamos entender a resolução.'}
                  </strong>
                  <p className="mt-1">{result.explanation}</p>
                </div>
              ) : (
                <Button
                  className="mt-5"
                  loading={pending}
                  disabled={answer === null}
                  onClick={() => void practice()}
                >
                  Conferir resolução
                </Button>
              )}
              {practiceError && (
                <p role="alert" className="mt-3 text-sm text-red-700">
                  {practiceError}
                </p>
              )}
              <Button
                variant="secondary"
                className="mt-4"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/questoes?id=${encodeURIComponent(detail.data!.id)}`
                    );
                    notify('Link da questão copiado.');
                  } catch {
                    notify(
                      'Não foi possível copiar. Copie o endereço da barra do navegador.',
                      true
                    );
                  }
                }}
              >
                Copiar link da questão
              </Button>
            </>
          )
        )}
      </Dialog>
    </>
  );
}
