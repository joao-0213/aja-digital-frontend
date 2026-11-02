'use client';

import type { Question } from '@/models';
import { Input, Select, Button } from '@/components/ui';
import { difficultyLabels } from '@/lib/utils';
import { emptyQuestionFilters, type QuestionFilterValue } from '../lib/question-filters';

export function QuestionFilters({ questions, value, onChange }: { questions: Question[]; value: QuestionFilterValue; onChange: (next: QuestionFilterValue) => void }) {
  return <div className="space-y-4">
    <Input label="Buscar questões" placeholder="Enunciado ou tema" value={value.search} onChange={e => onChange({ ...value, search: e.target.value })} />
    {(['subject', 'topic', 'difficulty', 'institution'] as const).map(field => <Select key={field} label={{ subject: 'Matéria', topic: 'Tema', difficulty: 'Dificuldade', institution: 'Instituição' }[field]} value={value[field]} onChange={e => onChange({ ...value, [field]: e.target.value, ...(field === 'subject' ? { topic: 'all' } : {}) })}>
      <option value="all">Todas</option>
      {[...new Set(questions.filter(q => field !== 'topic' || value.subject === 'all' || q.subject === value.subject).map(q => q[field]))].map(item => <option key={item} value={item}>{field === 'difficulty' ? difficultyLabels[item as keyof typeof difficultyLabels] : item}</option>)}
    </Select>)}
    <Button variant="ghost" onClick={() => onChange(emptyQuestionFilters)}>Limpar filtros</Button>
  </div>;
}
