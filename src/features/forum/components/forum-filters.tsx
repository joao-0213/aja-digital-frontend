'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  GraduationCap,
  MessageSquareOff,
  Search,
  X
} from 'lucide-react';
import { cn, textMatch } from '@/lib/utils';

type DropdownOption = { value: string; label: string; meta?: string };

function FilterDropdown({
  label,
  icon,
  value,
  options,
  allLabel,
  onChange
}: {
  label: string;
  icon: ReactNode;
  value: string;
  options: readonly DropdownOption[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const active = value !== 'all';
  const current = options.find((item) => item.value === value);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const handlePointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node))
        setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    if (options.length >= 4) requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, options.length]);

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return options;
    return options.filter((item) => textMatch(`${item.label} ${item.meta ?? ''}`, trimmed));
  }, [options, query]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex h-11 w-full items-center gap-2.5 rounded-xl border px-3.5 text-left text-sm shadow-2xs transition-colors',
          active
            ? 'border-brand-300 bg-brand-50/70 font-medium text-brand-900 hover:bg-brand-50'
            : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
        )}
      >
        <span className={cn('shrink-0', active ? 'text-brand-600' : 'text-slate-400')}>{icon}</span>
        <span className="min-w-0 flex-1 truncate">{current?.label ?? allLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 transition-transform',
            active ? 'text-brand-600' : 'text-slate-400',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 min-w-[240px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:right-auto sm:min-w-[280px]">
          {options.length >= 4 && (
            <div className="relative border-b border-slate-100 bg-slate-50/70 p-2">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={searchInputRef}
                type="text"
                role="searchbox"
                aria-label={`Filtrar ${label.toLowerCase()}`}
                placeholder="Buscar…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Limpar busca"
                  onClick={() => setQuery('')}
                  className="absolute right-3.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              )}
            </div>
          )}
          <ul
            id={listboxId}
            role="listbox"
            aria-label={label}
            className="max-h-60 divide-y divide-slate-100 overflow-y-auto py-1"
          >
            {!query.trim() && (
              <li role="option" aria-selected={value === 'all'}>
                <button
                  type="button"
                  onClick={() => {
                    onChange('all');
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors',
                    value === 'all'
                      ? 'bg-brand-50/70 font-medium text-brand-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{allLabel}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center',
                      value === 'all' ? 'text-brand-600' : 'text-transparent'
                    )}
                  >
                    <Check className="size-4" strokeWidth={2.5} />
                  </span>
                </button>
              </li>
            )}
            {filtered.map((option) => {
              const selected = option.value === value;
              return (
                <li key={option.value} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors',
                      selected
                        ? 'bg-brand-50/70 font-medium text-brand-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.meta && (
                        <span className="block truncate text-xs font-normal text-slate-500">
                          {option.meta}
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center',
                        selected ? 'text-brand-600' : 'text-transparent'
                      )}
                    >
                      <Check className="size-4" strokeWidth={2.5} />
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-3.5 py-3 text-xs text-slate-500">Nenhuma opção encontrada.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

const statusTabs = [
  { value: 'all', label: 'Todas' },
  { value: 'unread', label: 'Não lidas', icon: CircleDot },
  { value: 'unanswered', label: 'Sem respostas', icon: MessageSquareOff },
  { value: 'solved', label: 'Resolvidas', icon: CheckCircle2 }
] as const;

export function ForumFilters({
  search,
  onSearchChange,
  classId,
  onClassChange,
  subjectId,
  onSubjectChange,
  filter,
  onFilterChange,
  classes,
  subjects
}: {
  search: string;
  onSearchChange: (value: string) => void;
  classId: string;
  onClassChange: (value: string) => void;
  subjectId: string;
  onSubjectChange: (value: string) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  classes: readonly { id: string; name: string; active: boolean }[];
  subjects: readonly { id: string; name: string; classId: string }[];
}) {
  const classOptions = useMemo<DropdownOption[]>(
    () =>
      classes.map((item) => ({
        value: item.id,
        label: item.name,
        meta: item.active ? undefined : 'Turma encerrada'
      })),
    [classes]
  );
  const subjectOptions = useMemo<DropdownOption[]>(
    () =>
      subjects
        .filter((item) => classId === 'all' || item.classId === classId)
        .map((item) => ({
          value: item.id,
          label: item.name,
          meta: classId === 'all' ? classes.find((row) => row.id === item.classId)?.name : undefined
        })),
    [classes, classId, subjects]
  );

  const selectedClass = classes.find((item) => item.id === classId);
  const selectedSubject = subjects.find((item) => item.id === subjectId);
  const hasActiveFilters =
    !!search.trim() || classId !== 'all' || subjectId !== 'all' || filter !== 'all';

  const clearAll = () => {
    onSearchChange('');
    onClassChange('all');
    onSubjectChange('all');
    onFilterChange('all');
  };

  return (
    <section
      aria-label="Filtros do fórum"
      className="mb-6 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs sm:p-4"
    >
      <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_220px_250px]">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            role="searchbox"
            aria-label="Buscar no fórum"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Busque uma dúvida ou um assunto…"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-9 text-sm text-slate-900 shadow-2xs placeholder:text-slate-400 transition-colors hover:border-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {search && (
            <button
              type="button"
              aria-label="Limpar busca do fórum"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
        <FilterDropdown
          label="Turma do fórum"
          icon={<GraduationCap aria-hidden="true" className="size-4" />}
          value={classId}
          options={classOptions}
          allLabel="Todas as turmas"
          onChange={(next) => {
            onClassChange(next);
            onSubjectChange('all');
          }}
        />
        <FilterDropdown
          label="Disciplina do fórum"
          icon={<BookOpen aria-hidden="true" className="size-4" />}
          value={subjectId}
          options={subjectOptions}
          allLabel="Todas as disciplinas"
          onChange={onSubjectChange}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 pt-3">
        <div role="radiogroup" aria-label="Filtrar por situação" className="flex flex-wrap gap-1.5">
          {statusTabs.map((tab) => {
            const active = filter === tab.value;
            const Icon = 'icon' in tab ? tab.icon : undefined;
            return (
              <button
                key={tab.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onFilterChange(tab.value)}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-brand-300 bg-brand-50 text-brand-800 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                {Icon && (
                  <Icon
                    aria-hidden="true"
                    className={cn('size-3.5', active ? 'text-brand-600' : 'text-slate-400')}
                  />
                )}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedClass && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-900">
                <span className="max-w-[160px] truncate">{selectedClass.name}</span>
                <button
                  type="button"
                  aria-label={`Remover filtro ${selectedClass.name}`}
                  onClick={() => {
                    onClassChange('all');
                    onSubjectChange('all');
                  }}
                  className="inline-flex size-4 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200/70"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </span>
            )}
            {selectedSubject && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-900">
                <span className="max-w-[180px] truncate">{selectedSubject.name}</span>
                <button
                  type="button"
                  aria-label={`Remover filtro ${selectedSubject.name}`}
                  onClick={() => onSubjectChange('all')}
                  className="inline-flex size-4 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200/70"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={clearAll}
              className="px-1.5 text-xs font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-900"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
