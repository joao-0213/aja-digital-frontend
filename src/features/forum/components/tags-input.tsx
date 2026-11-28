'use client';

import { useId, useMemo, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TagsInput({
  value,
  disabled,
  onChange
}: {
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const chips = useMemo(
    () =>
      [
        ...new Set(
          value
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        )
      ].slice(0, 5),
    [value]
  );

  const commit = (raw: string) => {
    const pieces = raw
      .split(',')
      .map((item) => item.trim().replace(/^#+/, ''))
      .filter(Boolean);
    if (!pieces.length) {
      setDraft('');
      return;
    }
    const next = [...new Set([...chips, ...pieces])].slice(0, 5);
    onChange(next.join(', '));
    setDraft('');
  };

  const remove = (target: string) => {
    onChange(chips.filter((item) => item !== target).join(', '));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          Tags <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <span className="text-xs text-slate-400 tabular-nums">{chips.length}/5</span>
      </div>
      <div
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 transition-colors focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100',
          disabled && 'bg-slate-50 opacity-60'
        )}
      >
        <Tag aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
        {chips.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-brand-900"
          >
            <span>#{tag}</span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remover tag ${tag}`}
              onClick={() => remove(tag)}
              className="inline-flex size-4 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200/70"
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </span>
        ))}
        {chips.length < 5 && (
          <input
            id={inputId}
            type="text"
            disabled={disabled}
            value={draft}
            placeholder={
              chips.length ? 'Adicionar tag…' : 'Ex.: proporção, exercício (Enter para adicionar)'
            }
            onChange={(event) => {
              const next = event.target.value;
              if (next.includes(',')) commit(next);
              else setDraft(next);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit(draft);
              } else if (event.key === 'Backspace' && !draft && chips.length) {
                remove(chips[chips.length - 1]);
              }
            }}
            onBlur={() => {
              if (draft.trim()) commit(draft);
            }}
            className="min-w-[140px] flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        )}
      </div>
    </div>
  );
}
