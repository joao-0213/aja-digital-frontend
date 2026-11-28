'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown, Search, X } from 'lucide-react';
import { cn, textMatch } from '@/lib/utils';

export type SubjectOption = { id: string; name: string; classId: string; className?: string };

export function SubjectCombobox({
  value,
  options,
  disabled,
  onChange
}: {
  value: string;
  options: readonly SubjectOption[];
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selected = options.find((item) => item.id === value);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node))
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey, true);
    if (options.length >= 4) requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, options.length]);

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return options;
    return options.filter((item) => textMatch(`${item.name} ${item.className ?? ''}`, trimmed));
  }, [options, query]);

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <span className="block text-sm font-medium text-slate-700">
        Disciplina
        <span aria-hidden="true" className="ml-0.5 text-rose-600">
          *
        </span>
      </span>
      <button
        type="button"
        disabled={disabled}
        aria-label="Selecionar disciplina"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex min-h-12 w-full items-center gap-3 rounded-xl border px-3.5 py-2 text-left transition-colors disabled:opacity-50',
          selected
            ? 'border-brand-200 bg-brand-50/40 hover:border-brand-300 hover:bg-brand-50/70'
            : 'border-slate-300 bg-white hover:border-slate-400'
        )}
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            selected ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
          )}
        >
          <BookOpen aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block truncate text-sm font-medium text-slate-900">
                {selected.name}
              </span>
              {selected.className && (
                <span className="block truncate text-xs text-slate-500">{selected.className}</span>
              )}
            </>
          ) : (
            <span className="text-sm text-slate-400">Selecione uma disciplina</span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-slate-400 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {options.length >= 4 && (
            <div className="relative border-b border-slate-100 bg-slate-50/70 p-2">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={searchRef}
                type="text"
                role="searchbox"
                aria-label="Buscar disciplina"
                placeholder="Buscar disciplina ou turma…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Limpar busca de disciplina"
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
            aria-label="Disciplinas disponíveis"
            className="max-h-52 divide-y divide-slate-100 overflow-y-auto py-1"
          >
            {filtered.map((option) => {
              const active = option.id === value;
              return (
                <li key={option.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
                      active ? 'bg-brand-50/70 text-brand-900' : 'text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-sm',
                          active ? 'font-semibold text-brand-900' : 'font-medium text-slate-900'
                        )}
                      >
                        {option.name}
                      </span>
                      {option.className && (
                        <span className="block truncate text-xs text-slate-500">
                          {option.className}
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                        active
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-slate-300 bg-white text-transparent'
                      )}
                    >
                      <Check className="size-3.5" strokeWidth={2.5} />
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-3.5 py-3 text-xs text-slate-500">Nenhuma disciplina encontrada.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
