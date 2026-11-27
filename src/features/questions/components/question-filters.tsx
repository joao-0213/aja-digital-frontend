'use client';

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Building2, Calendar, Check, ChevronDown, Gauge, PanelLeftClose, Search, SlidersHorizontal, Tag, X } from 'lucide-react';
import { cn, textMatch } from '@/lib/utils';
import { difficultyLabels } from '@/lib/labels';
import type { BankQuestion } from '../api';
import { emptyQuestionFilters, type QuestionFilterValue } from '../lib/question-filters';

type DropdownOption = {
  value: string;
  label: string;
  count: number;
  group?: string;
};

function matchesExcept(
  question: BankQuestion,
  filters: QuestionFilterValue,
  omit: 'subject' | 'topic' | 'difficulty' | 'institution' | 'year',
) {
  const year = filters.year ?? 'all';
  if (filters.search.trim() && !textMatch(`${question.statement} ${question.subject} ${question.topic} ${question.institution}`, filters.search)) return false;
  if (omit !== 'subject' && filters.subject !== 'all' && question.subject !== filters.subject) return false;
  if (omit !== 'topic' && filters.topic !== 'all' && question.topic !== filters.topic) return false;
  if (omit !== 'difficulty' && filters.difficulty !== 'all' && question.difficulty !== filters.difficulty) return false;
  if (omit !== 'institution' && filters.institution !== 'all' && question.institution !== filters.institution) return false;
  if (omit !== 'year' && year !== 'all' && String(question.year) !== year) return false;
  return true;
}

function FacetDropdown({
  label,
  hint,
  icon,
  value,
  options,
  allLabel,
  searchPlaceholder,
  totalCount,
  onChange,
}: {
  label: string;
  hint?: string;
  icon: ReactNode;
  value: string;
  options: readonly DropdownOption[];
  allLabel: string;
  searchPlaceholder: string;
  totalCount: number;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const active = value !== 'all';
  const current = options.find(item => item.value === value);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const handlePointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return options;
    return options.filter(item => textMatch(`${item.label} ${item.group ?? ''}`, trimmed));
  }, [options, query]);

  return <div ref={containerRef} className="relative space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </div>
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-controls={open ? listboxId : undefined}
      onClick={() => setOpen(prev => !prev)}
      className={cn(
        'flex h-10 w-full items-center gap-2.5 rounded-xl border px-3 text-left text-sm shadow-2xs transition-colors',
        active
          ? 'border-brand-300 bg-brand-50/70 font-medium text-brand-900 hover:bg-brand-50'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-brand-600' : 'text-slate-400')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{current?.label ?? allLabel}</span>
      <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 transition-transform', active ? 'text-brand-600' : 'text-slate-400', open && 'rotate-180')} />
    </button>

    {open && <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      <div className="relative border-b border-slate-100 bg-slate-50/70 p-2">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchInputRef}
          type="text"
          role="searchbox"
          aria-label={`Pesquisar ${label.toLowerCase()}`}
          placeholder={searchPlaceholder}
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {query && <button type="button" aria-label="Limpar pesquisa" onClick={() => setQuery('')} className="absolute right-3.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X aria-hidden="true" className="size-3" /></button>}
      </div>
      <ul id={listboxId} role="listbox" aria-label={label} className="max-h-60 divide-y divide-slate-100/80 overflow-y-auto py-1">
        {!query.trim() && <li role="option" aria-selected={value === 'all'}>
          <button
            type="button"
            onClick={() => { onChange('all'); setOpen(false); }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
              value === 'all' ? 'bg-brand-50/70 font-medium text-brand-900' : 'text-slate-700 hover:bg-slate-50',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{allLabel}</span>
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">{totalCount}</span>
            <span aria-hidden="true" className={cn('flex size-4 shrink-0 items-center justify-center', value === 'all' ? 'text-brand-600' : 'text-transparent')}>
              <Check className="size-4" strokeWidth={2.5} />
            </span>
          </button>
        </li>}
        {filtered.map((option, idx) => {
          const selected = option.value === value;
          const showGroupHeader = option.group && (idx === 0 || filtered[idx - 1]?.group !== option.group);
          const muted = option.count === 0 && !selected;
          return <Fragment key={`${option.group ?? ''}:${option.value}`}>
            {showGroupHeader && <li role="presentation" className="bg-slate-50/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{option.group}</li>}
            <li role="option" aria-selected={selected}>
              <button
                type="button"
                onClick={() => { onChange(option.value); setOpen(false); }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                  selected ? 'bg-brand-50/70 font-medium text-brand-900' : muted ? 'text-slate-400 hover:bg-slate-50' : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums', selected ? 'bg-brand-100 text-brand-800' : muted ? 'bg-slate-100/70 text-slate-400' : 'bg-slate-100 text-slate-600')}>{option.count}</span>
                <span aria-hidden="true" className={cn('flex size-4 shrink-0 items-center justify-center', selected ? 'text-brand-600' : 'text-transparent')}>
                  <Check className="size-4" strokeWidth={2.5} />
                </span>
              </button>
            </li>
          </Fragment>;
        })}
        {filtered.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">Nenhuma opção encontrada.</li>}
      </ul>
    </div>}
  </div>;
}

const difficultyTabs = [
  { value: 'all', label: 'Todas' },
  { value: 'easy', label: difficultyLabels.easy },
  { value: 'medium', label: difficultyLabels.medium },
  { value: 'hard', label: difficultyLabels.hard },
] as const;

export function countActiveQuestionFilters(value: QuestionFilterValue): number {
  return [
    !!value.search.trim(),
    value.subject !== 'all',
    value.topic !== 'all',
    value.difficulty !== 'all',
    value.institution !== 'all',
    (value.year ?? 'all') !== 'all',
  ].filter(Boolean).length;
}

export function QuestionFilters({
  questions,
  value,
  onChange,
  onCollapse,
}: {
  questions: BankQuestion[];
  value: QuestionFilterValue;
  onChange: (next: QuestionFilterValue) => void;
  onCollapse?: () => void;
}) {
  const currentYear = value.year ?? 'all';

  const subjectFacet = useMemo(() => {
    const pool = questions.filter(q => matchesExcept(q, value, 'subject'));
    const counts = new Map<string, number>();
    for (const q of pool) counts.set(q.subject, (counts.get(q.subject) ?? 0) + 1);
    const allNames = [...new Set(questions.map(q => q.subject))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      total: pool.length,
      options: allNames.map(name => ({ value: name, label: name, count: counts.get(name) ?? 0 })),
    };
  }, [questions, value]);

  const topicFacet = useMemo(() => {
    const pool = questions.filter(q => matchesExcept(q, value, 'topic'));
    const counts = new Map<string, number>();
    for (const q of pool) counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);

    const scopedQuestions = value.subject === 'all' ? questions : questions.filter(q => q.subject === value.subject);
    if (value.subject !== 'all') {
      const names = [...new Set(scopedQuestions.map(q => q.topic))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      return {
        total: pool.length,
        options: names.map(name => ({ value: name, label: name, count: counts.get(name) ?? 0 })),
      };
    }

    // Group topics by subject when no specific subject is selected.
    const bySubject = new Map<string, Set<string>>();
    for (const q of scopedQuestions) {
      const set = bySubject.get(q.subject) ?? new Set<string>();
      set.add(q.topic);
      bySubject.set(q.subject, set);
    }
    const grouped: DropdownOption[] = [];
    for (const subject of [...bySubject.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
      for (const topic of [...bySubject.get(subject)!].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
        grouped.push({ value: topic, label: topic, group: subject, count: counts.get(topic) ?? 0 });
      }
    }
    return { total: pool.length, options: grouped };
  }, [questions, value]);

  const difficultyCounts = useMemo(() => {
    const pool = questions.filter(q => matchesExcept(q, value, 'difficulty'));
    return {
      all: pool.length,
      easy: pool.filter(q => q.difficulty === 'easy').length,
      medium: pool.filter(q => q.difficulty === 'medium').length,
      hard: pool.filter(q => q.difficulty === 'hard').length,
    };
  }, [questions, value]);

  const institutionFacet = useMemo(() => {
    const pool = questions.filter(q => matchesExcept(q, value, 'institution'));
    const counts = new Map<string, number>();
    for (const q of pool) counts.set(q.institution, (counts.get(q.institution) ?? 0) + 1);
    const allNames = [...new Set(questions.map(q => q.institution))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      total: pool.length,
      options: allNames.map(name => ({ value: name, label: name, count: counts.get(name) ?? 0 })),
    };
  }, [questions, value]);

  const yearFacet = useMemo(() => {
    const pool = questions.filter(q => matchesExcept(q, value, 'year'));
    const counts = new Map<string, number>();
    for (const q of pool) {
      const key = String(q.year);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const allYears = [...new Set(questions.map(q => q.year))].sort((a, b) => b - a);
    return {
      total: pool.length,
      options: allYears.map(year => ({ value: String(year), label: String(year), count: counts.get(String(year)) ?? 0 })),
    };
  }, [questions, value]);

  const activeCount = countActiveQuestionFilters(value);

  return <aside aria-label="Filtros do banco de questões" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:sticky lg:top-6">
    <div className="mb-4 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
      <div className="flex items-center gap-2">
        <SlidersHorizontal aria-hidden="true" className="size-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-900">Filtros</h2>
        {activeCount > 0 && <span className="inline-flex size-5 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-800 tabular-nums">{activeCount}</span>}
      </div>
      {onCollapse && <button
        type="button"
        aria-label="Recolher painel de filtros"
        title="Recolher filtros"
        onClick={onCollapse}
        className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        <PanelLeftClose aria-hidden="true" className="size-4" />
      </button>}
    </div>

    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-slate-600">Buscar questões</span>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            role="searchbox"
            aria-label="Buscar questões"
            value={value.search}
            onChange={event => onChange({ ...value, search: event.target.value })}
            placeholder="Enunciado ou tema…"
            className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-8 text-sm text-slate-900 shadow-2xs placeholder:text-slate-400 transition-colors hover:border-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {value.search && <button
            type="button"
            aria-label="Limpar busca de questões"
            onClick={() => onChange({ ...value, search: '' })}
            className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>}
        </div>
      </div>

      <FacetDropdown
        label="Matéria"
        icon={<BookOpen aria-hidden="true" className="size-4" />}
        value={value.subject}
        options={subjectFacet.options}
        totalCount={subjectFacet.total}
        allLabel="Todas as matérias"
        searchPlaceholder="Pesquisar matéria…"
        onChange={subject => onChange({ ...value, subject, topic: 'all' })}
      />

      <FacetDropdown
        label="Tema"
        hint={value.subject === 'all' ? 'Agrupado por matéria' : value.subject}
        icon={<Tag aria-hidden="true" className="size-4" />}
        value={value.topic}
        options={topicFacet.options}
        totalCount={topicFacet.total}
        allLabel="Todos os temas"
        searchPlaceholder="Pesquisar tema ou matéria…"
        onChange={topic => onChange({ ...value, topic })}
      />

      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <Gauge aria-hidden="true" className="size-3.5 text-slate-400" />
          Dificuldade
        </span>
        <div role="radiogroup" aria-label="Filtrar por dificuldade" className="grid grid-cols-2 gap-1.5">
          {difficultyTabs.map(tab => {
            const active = value.difficulty === tab.value;
            const count = difficultyCounts[tab.value];
            const muted = count === 0 && !active;
            return <button
              key={tab.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ ...value, difficulty: tab.value })}
              className={cn(
                'inline-flex min-h-9 items-center justify-between gap-1 rounded-xl border px-2.5 text-xs font-medium transition-colors',
                active
                  ? 'border-brand-300 bg-brand-50 text-brand-800 shadow-2xs'
                  : muted
                    ? 'border-slate-200 bg-slate-50/50 text-slate-400 hover:border-slate-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <span>{tab.label}</span>
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', active ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-500')}>{count}</span>
            </button>;
          })}
        </div>
      </div>

      <FacetDropdown
        label="Instituição"
        icon={<Building2 aria-hidden="true" className="size-4" />}
        value={value.institution}
        options={institutionFacet.options}
        totalCount={institutionFacet.total}
        allLabel="Todas as bancas"
        searchPlaceholder="Pesquisar instituição…"
        onChange={institution => onChange({ ...value, institution })}
      />

      <FacetDropdown
        label="Ano"
        icon={<Calendar aria-hidden="true" className="size-4" />}
        value={currentYear}
        options={yearFacet.options}
        totalCount={yearFacet.total}
        allLabel="Todos os anos"
        searchPlaceholder="Pesquisar ano…"
        onChange={year => onChange({ ...value, year })}
      />

      {activeCount > 0 && <div className="border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => onChange(emptyQuestionFilters)}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50/70 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100/70"
        >
          <X aria-hidden="true" className="size-3.5" />
          Limpar filtros
        </button>
      </div>}
    </div>
  </aside>;
}
