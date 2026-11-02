'use client';

import { Badge, Button, Card } from '@/components/ui';
import { difficultyLabels } from '@/lib/utils';
import type { BankQuestion } from '../api';

/** Selection exposes the public bank projection; assessment snapshots stay server-side. */
export function QuestionPicker({ items, onSelect, selectedIds = [], selectionMode = false, disabled = false }: { items: BankQuestion[]; onSelect: (question: BankQuestion) => void; selectedIds?: readonly string[]; selectionMode?: boolean; disabled?: boolean }) {
  return <div className="space-y-4">{items.map(q => <Card key={q.id}>
    <div className="mb-4 flex flex-wrap gap-2"><Badge tone="purple">{q.subject}</Badge><Badge>{q.topic}</Badge><Badge>{difficultyLabels[q.difficulty]}</Badge><span className="ml-auto text-xs text-slate-400">{q.institution} · {q.year} · {q.id.toUpperCase()}</span></div>
    <p className="leading-7">{q.statement}</p>
    <div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{q.options.length} alternativas · Resposta única</span><Button variant="secondary" disabled={disabled} aria-pressed={selectionMode ? selectedIds.includes(q.id) : undefined} onClick={() => onSelect(q)}>{selectionMode ? selectedIds.includes(q.id) ? 'Remover seleção' : 'Selecionar' : 'Ver questão'}</Button></div>
  </Card>)}</div>;
}
