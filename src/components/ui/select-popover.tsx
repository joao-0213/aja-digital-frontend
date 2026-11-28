'use client';

import { Fragment, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ParsedSelectOption } from './select-options';

export type SelectPopoverPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function computeSelectPopoverPosition(
  trigger: HTMLElement,
  showSearch: boolean
): SelectPopoverPosition {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const flipUp = spaceBelow < 220 && spaceAbove > spaceBelow;
  const width = Math.min(Math.max(rect.width, 200), window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const maxHeight = Math.max(
    140,
    Math.min(260, (flipUp ? spaceAbove : spaceBelow) - (showSearch ? 52 : 8))
  );
  return flipUp
    ? { bottom: window.innerHeight - rect.top + 6, left, width, maxHeight }
    : { top: rect.bottom + 6, left, width, maxHeight };
}

export function SelectPopover({
  portalTarget,
  popoverRef,
  searchRef,
  listboxId,
  ariaLabel,
  position,
  showSearch,
  query,
  filtered,
  currentValue,
  highlightedIndex,
  onQueryChange,
  onHighlight,
  onSelect,
  onKeyDown
}: {
  portalTarget: HTMLElement;
  popoverRef: RefObject<HTMLDivElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  listboxId: string;
  ariaLabel: string;
  position: SelectPopoverPosition;
  showSearch: boolean;
  query: string;
  filtered: ParsedSelectOption[];
  currentValue: string;
  highlightedIndex: number;
  onQueryChange: (nextQuery: string) => void;
  onHighlight: (index: number) => void;
  onSelect: (option: ParsedSelectOption) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return createPortal(
    <div
      ref={popoverRef}
      onKeyDown={onKeyDown}
      style={{
        position: 'fixed',
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        width: position.width,
        zIndex: 60
      }}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
    >
      {showSearch && (
        <div className="relative border-b border-slate-100 bg-slate-50/70 p-2">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
          />
          <input
            ref={searchRef}
            type="text"
            role="searchbox"
            aria-label="Filtrar opções"
            placeholder="Buscar opção…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {query && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => onQueryChange('')}
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
        aria-label={ariaLabel}
        style={{ maxHeight: position.maxHeight }}
        className="divide-y divide-slate-100/80 overflow-y-auto py-1"
      >
        {filtered.map((option, idx) => {
          const selected = option.value === currentValue;
          const highlighted = idx === highlightedIndex;
          const showGroupHeader =
            option.group && (idx === 0 || filtered[idx - 1]?.group !== option.group);
          return (
            <Fragment key={`${option.value}:${idx}`}>
              {showGroupHeader && (
                <li
                  role="presentation"
                  className="px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {option.group}
                </li>
              )}
              <li role="option" aria-selected={selected} aria-disabled={option.disabled}>
                <button
                  type="button"
                  disabled={option.disabled}
                  onMouseEnter={() => {
                    if (!option.disabled) onHighlight(idx);
                  }}
                  onClick={() => onSelect(option)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors',
                    option.disabled
                      ? 'cursor-not-allowed text-slate-400'
                      : selected
                        ? 'bg-brand-50/80 font-medium text-brand-900'
                        : highlighted
                          ? 'bg-slate-50 text-slate-900'
                          : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
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
            </Fragment>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-3.5 py-3 text-xs text-slate-500">Nenhuma opção encontrada.</li>
        )}
      </ul>
    </div>,
    portalTarget
  );
}
