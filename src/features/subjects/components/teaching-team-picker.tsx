'use client';

import { useId, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { Avatar, Button } from '@/components/ui';
import { cn, countLabel, textMatch } from '@/lib/utils';
import type { TeachingTeamOption } from '../lib/teaching-team';

export type TeachingTeamPickerOption = TeachingTeamOption & { email?: string };

export function TeachingTeamPicker({
  options,
  disabled,
  onToggle,
  onRemove,
}: {
  options: readonly TeachingTeamPickerOption[];
  disabled?: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const available = useMemo(() => options.filter(option => option.available), [options]);
  const unavailable = useMemo(() => options.filter(option => !option.available), [options]);
  const selectedAvailable = useMemo(() => available.filter(option => option.selected), [available]);
  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return available;
    return available.filter(option => textMatch(option.name, trimmed) || (option.email ? textMatch(option.email, trimmed) : false));
  }, [available, query]);

  return <fieldset disabled={disabled} className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <legend className="text-sm font-medium text-slate-700">Equipe docente</legend>
      <span className="text-xs font-medium text-slate-500">
        {selectedAvailable.length ? countLabel(selectedAvailable.length, 'docente selecionado', 'docentes selecionados') : 'Nenhum selecionado'}
      </span>
    </div>

    {selectedAvailable.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Docentes selecionados">
      {selectedAvailable.map(option => <span
        key={option.id}
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-brand-200 bg-brand-50 py-1 pl-1.5 pr-2 text-xs font-medium text-brand-900"
      >
        <Avatar name={option.name} size="sm" />
        <span className="truncate">{option.name}</span>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Remover ${option.name} da equipe`}
          onClick={() => onRemove(option.id)}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-brand-700 transition-colors hover:bg-brand-200/70 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-50"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </span>)}
    </div>}

    {available.length > 0 ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="relative border-b border-slate-100 bg-slate-50/70 px-3 py-2">
        <Search aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          id={searchId}
          type="text"
          role="searchbox"
          aria-label="Buscar docente por nome ou e-mail"
          placeholder="Buscar docente por nome ou e-mail…"
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {query && <button
          type="button"
          aria-label="Limpar busca de docente"
          onClick={() => setQuery('')}
          className="absolute right-5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>}
      </div>

      {filtered.length > 0 ? <ul role="list" className="max-h-52 divide-y divide-slate-100 overflow-y-auto">
        {filtered.map(option => <li key={option.id}>
          <label className={cn(
            'flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors',
            option.selected ? 'bg-brand-50/60 hover:bg-brand-50' : 'hover:bg-slate-50',
            disabled && 'cursor-not-allowed opacity-60',
          )}>
            <input
              type="checkbox"
              checked={option.selected}
              onChange={event => onToggle(option.id, event.target.checked)}
              className="peer sr-only"
            />
            <Avatar name={option.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{option.name}</span>
              {option.email && <span className="block truncate text-xs text-slate-500">{option.email}</span>}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600',
                option.selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-transparent',
              )}
            >
              <Check className="size-3.5" strokeWidth={2.5} />
            </span>
          </label>
        </li>)}
      </ul> : <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-slate-500">
        <span>Nenhum docente encontrado para “{query.trim()}”.</span>
        <button type="button" onClick={() => setQuery('')} className="font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-900">Limpar busca</button>
      </div>}
    </div> : <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-500">
      Cadastre um docente em Usuários e docentes. Você pode salvar a disciplina sem equipe.
    </p>}

    {unavailable.length > 0 && <div role="alert" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
      <p>Revise os docentes selecionados. Seu texto e as demais seleções foram mantidos.</p>
      {unavailable.map(option => <div key={option.id}>
        <p className="font-semibold">{option.name}</p>
        <p className="mb-2 text-slate-600">{option.reason}</p>
        <Button variant="secondary" aria-label={`Remover ${option.name} da seleção`} onClick={() => onRemove(option.id)}>Remover da seleção</Button>
      </div>)}
    </div>}
  </fieldset>;
}
