'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSession } from '@/providers/app-context';
import { useHttpQuery } from '@/hooks/use-http-query';
import { Button, Empty, ErrorState, Input, Skeleton } from '@/components/ui';
import { createQuestionsApi, type BankQuestion } from '../api';
import { emptyQuestionFilters } from '../lib/question-filters';
import { QuestionPicker } from './question-picker';

export function BankSelector({ selectedIds, disabled, onSelect }: { selectedIds: readonly string[]; disabled: boolean; onSelect: (question: BankQuestion) => void }) {
  const { client, sessionKey, resourceEpoch } = useSession();
  const api = useMemo(() => createQuestionsApi(client), [client]);
  const [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const query = useHttpQuery({ sessionKey, key: JSON.stringify(['bank-selector', search, page, resourceEpoch]) }, useCallback(signal => api.list({ ...emptyQuestionFilters, search }, page, signal), [api, search, page]));
  return <div className="space-y-4">
    <Input label="Buscar questões" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
    {query.loading ? <Skeleton /> : query.error ? <ErrorState message={query.error.message} retry={() => void query.retry()} /> : !query.data?.items.length ? <Empty title="Nenhuma questão encontrada" description="Experimente ampliar a busca." /> : <QuestionPicker items={query.data.items} selectedIds={selectedIds} disabled={disabled} selectionMode onSelect={onSelect} />}
    <div className="flex items-center justify-center gap-3"><Button variant="secondary" disabled={page <= 1 || query.loading} onClick={() => setPage(page - 1)}>Anterior</Button><span>Página {page} · {query.data?.total ?? 0} questões</span><Button variant="secondary" disabled={!query.data || page * query.data.pageSize >= query.data.total || query.loading} onClick={() => setPage(page + 1)}>Próxima</Button></div>
  </div>;
}
