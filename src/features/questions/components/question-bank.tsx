'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Filter } from 'lucide-react';
import { useApp, useSession } from '@/providers/app-context';
import { useHttpQuery } from '@/hooks/use-http-query';
import { createFilesApi } from '@/lib/http-files';
import { HttpError } from '@/lib/http-client';
import { Badge, Button, Card, Dialog, Empty, ErrorState, LinkButton, PageHeading, Skeleton } from '@/components/ui';
import { ResponsiveDisclosure } from '@/components/ui/responsive-disclosure';
import { cn, countLabel } from '@/lib/utils';
import { createQuestionsApi, type BankQuestion, type PracticeResult } from '../api';
import { emptyQuestionFilters, type QuestionFilterValue } from '../lib/question-filters';
import { QuestionFilters } from './question-filters';
import { QuestionPicker } from './question-picker';

const fields = { search: 'busca', subject: 'subject', topic: 'topic', difficulty: 'difficulty', institution: 'institution' } as const;

export function QuestionBank() {
  const { client, sessionKey, resourceEpoch } = useSession();
  const { notify } = useApp();
  const router = useRouter(), params = useSearchParams();
  const api = useMemo(() => createQuestionsApi(client), [client]);
  const filters = Object.fromEntries(Object.entries(fields).map(([key, name]) => [key, params.get(name) ?? emptyQuestionFilters[key as keyof QuestionFilterValue]])) as QuestionFilterValue;
  const page = Math.max(1, Number(params.get('page')) || 1), id = params.get('id');
  const identity = `${sessionKey}:${resourceEpoch}:${id}`;
  const currentIdentity = useRef(identity); currentIdentity.current = identity;
  const filterKey = JSON.stringify(filters);
  const changeUrl = (updates: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) value ? next.set(key, value) : next.delete(key);
    const url = `/questoes${next.size ? `?${next}` : ''}`;
    if (replace) router.replace(url, { scroll: false }); else router.push(url, { scroll: false });
  };
  const changeFilters = (next: QuestionFilterValue) => changeUrl({ ...Object.fromEntries(Object.entries(fields).map(([key, name]) => [name, next[key as keyof QuestionFilterValue] === emptyQuestionFilters[key as keyof QuestionFilterValue] ? null : next[key as keyof QuestionFilterValue]])), page: null }, true);
  const list = useHttpQuery({ sessionKey, key: JSON.stringify(['questions', filterKey, page, resourceEpoch]) }, useCallback(signal => api.list(JSON.parse(filterKey) as QuestionFilterValue, page, signal), [api, filterKey, page]));
  const options = useHttpQuery({ sessionKey, key: `question-options:${resourceEpoch}` }, useCallback(async signal => {
    const all: BankQuestion[] = [];
    for (let number = 1; ; number++) {
      if (signal.aborted || client.getSnapshot().sessionKey !== sessionKey) throw new Error('Consulta cancelada.');
      const result = await api.list(emptyQuestionFilters, number, signal, 100);
      if (signal.aborted || client.getSnapshot().sessionKey !== sessionKey) throw new Error('Consulta cancelada.');
      all.push(...result.items);
      if (all.length >= result.total || !result.items.length) return all;
    }
  }, [api, client, sessionKey]));
  const detail = useHttpQuery({ sessionKey, key: `question:${id}:${resourceEpoch}` }, useCallback(signal => api.read(id ?? '', signal), [api, id]), !!id);
  const [answer, setAnswer] = useState<number | null>(null), [result, setResult] = useState<PracticeResult | null>(null), [pending, setPending] = useState(false), [practiceError, setPracticeError] = useState('');
  useEffect(() => { setAnswer(null); setResult(null); setPending(false); setPracticeError(''); }, [id, sessionKey, resourceEpoch]);
  const practice = async () => {
    if (!id || answer === null || pending) return;
    const generation = client.getSnapshot(), startedIdentity = identity; setPending(true); setPracticeError('');
    try {
      const value = await api.practice(id, answer);
      if (currentIdentity.current === startedIdentity && client.getSnapshot().sessionKey === generation.sessionKey && client.getSnapshot().resourceEpoch === generation.resourceEpoch) setResult(value);
    } catch (error) { if (currentIdentity.current === startedIdentity && client.getSnapshot().sessionKey === generation.sessionKey && client.getSnapshot().resourceEpoch === generation.resourceEpoch) setPracticeError(error instanceof Error ? error.message : 'Não foi possível conferir a resolução.'); }
    finally { if (currentIdentity.current === startedIdentity && client.getSnapshot().sessionKey === generation.sessionKey && client.getSnapshot().resourceEpoch === generation.resourceEpoch) setPending(false); }
  };
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 5));
  return <>
    <LinkButton secondary href="/" className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />Voltar ao painel</LinkButton>
    <PageHeading title="Banco de questões" description="Busque questões por disciplina, assunto e dificuldade." />
    <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <Card className="!p-5"><ResponsiveDisclosure breakpoint="lg" title={<><Filter aria-hidden="true" className="size-4" />Filtros</>}>
        {options.error ? <ErrorState message={options.error.message} retry={() => void options.retry()} /> : <QuestionFilters questions={options.data ?? []} value={filters} onChange={changeFilters} />}
      </ResponsiveDisclosure></Card>
      <div>{list.loading ? <Skeleton /> : list.error ? <ErrorState message={list.error.message} retry={() => void list.retry()} /> : <>
        <p className="my-4 text-sm text-slate-400">{countLabel(list.data?.total ?? 0, 'questão encontrada', 'questões encontradas')}</p>
        <QuestionPicker items={list.data?.items ?? []} onSelect={q => changeUrl({ id: q.id })} />
        {!list.data?.items.length && <Empty title="Nenhuma questão com estes filtros" description="Experimente ampliar a busca ou limpar os filtros." action={<Button onClick={() => changeFilters(emptyQuestionFilters)}>Limpar filtros</Button>} />}
        <div className="mt-6 flex items-center justify-center gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => changeUrl({ page: String(page - 1) })}>Anterior</Button><span className="text-sm text-slate-500">{page} / {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => changeUrl({ page: String(page + 1) })}>Próxima</Button></div>
      </>}</div>
    </div>
    <Dialog open={!!id} onClose={() => changeUrl({ id: null })} title="Explorar questão">
      {detail.loading ? <Skeleton /> : detail.error ? detail.error instanceof HttpError && detail.error.kind === 'not-found' ? <Empty title="Questão indisponível" description="A referência não existe no acervo ou foi retirada." action={<Button onClick={() => changeUrl({ id: null })}>Voltar ao banco</Button>} /> : <ErrorState message={detail.error.message} retry={() => void detail.retry()} /> : detail.data && <>
        <div className="mb-4 flex flex-wrap gap-2"><Badge tone="purple">{detail.data.subject}</Badge><Badge>{detail.data.topic}</Badge></div><p className="mb-5 leading-7 [overflow-wrap:anywhere]">{detail.data.statement}</p>
        {detail.data.image && <QuestionImage image={detail.data.image} />}
        <div className="space-y-2" role="radiogroup" aria-label="Alternativas">{detail.data.options.map((option, index) => <label key={index} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-6', answer === index ? 'border-brand-500 bg-brand-50' : 'border-slate-200', result && index === result.correct && '!border-emerald-500 !bg-emerald-50')}><input className="mt-1 shrink-0 accent-brand-600" type="radio" name="practice" checked={answer === index} onChange={() => setAnswer(index)} disabled={!!result || pending} /><span className="min-w-0 [overflow-wrap:anywhere]"><strong className="mr-2">{String.fromCharCode(65 + index)}.</strong>{option}</span></label>)}</div>
        {result ? <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm leading-6 [overflow-wrap:anywhere]"><strong>{result.isCorrect ? 'Você acertou!' : 'Vamos entender a resolução.'}</strong><p className="mt-1">{result.explanation}</p></div> : <Button className="mt-5" loading={pending} disabled={answer === null} onClick={() => void practice()}>Conferir resolução</Button>}
        {practiceError && <p role="alert" className="mt-3 text-sm text-red-700">{practiceError}</p>}
        <Button variant="secondary" className="mt-4" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/questoes?id=${encodeURIComponent(detail.data!.id)}`); notify('Link da questão copiado.'); } catch { notify('Não foi possível copiar. Copie o endereço da barra do navegador.', true); } }}>Copiar link da questão</Button>
      </>}
    </Dialog>
  </>;
}

function QuestionImage({ image }: { image: { src: string; alt: string } }) {
  const { client, sessionKey, resourceEpoch } = useSession();
  const match = image.src.match(/^\/api\/v1\/files\/([^/]+)\/content$/);
  const fileId = match ? decodeURIComponent(match[1]) : '';
  const files = useMemo(() => createFilesApi(client), [client]);
  const imageQuery = useHttpQuery({ sessionKey, key: `question-image:${fileId}:${resourceEpoch}` }, useCallback(signal => files.download(fileId, 'inline', signal), [files, fileId]), !!fileId);
  const [url, setUrl] = useState('');
  useEffect(() => { if (!imageQuery.data) { setUrl(''); return; } const objectUrl = URL.createObjectURL(imageQuery.data); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [imageQuery.data]);
  if (!fileId) return /^\/questions\/[A-Za-z0-9_-]+\.(?:svg|png|jpe?g|webp)$/.test(image.src) ? <img src={image.src} alt={image.alt} className="my-4 max-h-80 max-w-full" /> : null;
  if (imageQuery.error) return <ErrorState message={imageQuery.error.message} retry={() => void imageQuery.retry()} />;
  if (imageQuery.loading) return <p role="status">Carregando imagem...</p>;
  return url ? <img src={url} alt={image.alt} className="my-4 max-h-80 max-w-full" /> : <p role="status">Carregando imagem...</p>;
}
