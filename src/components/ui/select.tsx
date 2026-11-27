'use client';

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, ChevronDown, Search, X } from 'lucide-react';
import { cn, textMatch } from '@/lib/utils';
import { fieldInvalid } from './field-styles';
import { friendlyValidationMessage, isFirstInvalidInForm } from './field-validation';

interface ParsedOption {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children);
  return '';
}

function parseOptions(children: ReactNode, group?: string): ParsedOption[] {
  const result: ParsedOption[] = [];
  Children.forEach(children, (child) => {
    if (
      !isValidElement<{
        value?: string | number;
        disabled?: boolean;
        label?: string;
        children?: ReactNode;
      }>(child)
    )
      return;
    if (child.type === Fragment) {
      result.push(...parseOptions(child.props.children, group));
      return;
    }
    if (child.type === 'optgroup') {
      result.push(...parseOptions(child.props.children, child.props.label));
      return;
    }
    if (child.type === 'option') {
      const label = extractText(child.props.children).trim();
      const value = child.props.value !== undefined ? String(child.props.value) : label;
      result.push({ value, label, disabled: Boolean(child.props.disabled), group });
    }
  });
  return result;
}

type PopoverPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function Select({
  label,
  error,
  children,
  value,
  defaultValue,
  onChange,
  onInvalid,
  disabled,
  required,
  name,
  className,
  title,
  'aria-label': ariaLabel,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
}) {
  const id = useId();
  const listboxId = useId();
  const options = useMemo(() => parseOptions(children), [children]);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(() => {
    if (defaultValue !== undefined) return String(defaultValue);
    return options[0]?.value ?? '';
  });
  const currentValue = isControlled ? String(value ?? '') : internalValue;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [validationError, setValidationError] = useState('');
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((item) => item.value === currentValue);
  const displayLabel = selectedOption?.label ?? options[0]?.label ?? 'Selecione uma opção';
  const isPlaceholder = currentValue === '' && !!selectedOption;
  const showSearch = options.length >= 6;
  const displayedError = error || validationError;

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return options;
    return options.filter((item) => textMatch(`${item.label} ${item.group ?? ''}`, trimmed));
  }, [options, query]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
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
    setPosition(
      flipUp
        ? { bottom: window.innerHeight - rect.top + 6, left, width, maxHeight }
        : { top: rect.bottom + 6, left, width, maxHeight }
    );
  }, [showSearch]);

  const openMenu = () => {
    if (disabled || triggerRef.current?.matches(':disabled')) return;
    const dialog = triggerRef.current?.closest('dialog');
    setPortalTarget((dialog as HTMLElement | null) ?? document.body);
    updatePosition();
    setQuery('');
    const currentIdx = options.findIndex((item) => item.value === currentValue && !item.disabled);
    setHighlightedIndex(currentIdx >= 0 ? currentIdx : options.findIndex((item) => !item.disabled));
    setOpen(true);
  };

  const closeMenu = useCallback((returnFocus = false) => {
    setOpen(false);
    setQuery('');
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    if (showSearch) requestAnimationFrame(() => searchRef.current?.focus());

    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      closeMenu(false);
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      }
    };
    const handleScroll = (event: Event) => {
      if (popoverRef.current?.contains(event.target as Node)) return;
      updatePosition();
    };
    const handleResize = () => updatePosition();

    document.addEventListener('mousedown', handlePointer, true);
    document.addEventListener('keydown', handleKey, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handlePointer, true);
      document.removeEventListener('keydown', handleKey, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, showSearch, updatePosition, closeMenu]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: currentValue is an intentional trigger to re-sync the active option after selection
  useEffect(() => {
    if (!validationError) return;
    if (nativeRef.current?.validity.valid) setValidationError('');
  }, [currentValue, validationError]);

  const selectOption = (option: ParsedOption) => {
    if (option.disabled) return;
    setValidationError('');
    if (!isControlled) setInternalValue(option.value);
    const nativeEl = nativeRef.current;
    if (nativeEl) {
      nativeEl.value = option.value;
      const synthetic = {
        target: nativeEl,
        currentTarget: nativeEl
      } as ChangeEvent<HTMLSelectElement>;
      onChange?.(synthetic);
    } else {
      const fallbackTarget = { value: option.value, name: name ?? '' } as HTMLSelectElement;
      onChange?.({
        target: fallbackTarget,
        currentTarget: fallbackTarget
      } as ChangeEvent<HTMLSelectElement>);
    }
    closeMenu(true);
  };

  const handleInvalid = (event: FormEvent<HTMLSelectElement>) => {
    event.preventDefault();
    const message = friendlyValidationMessage(event.currentTarget);
    setValidationError(message);
    if (isFirstInvalidInForm(event.currentTarget)) triggerRef.current?.focus();
    onInvalid?.(event);
  };

  const moveHighlight = (delta: number) => {
    if (!filtered.length) return;
    let next = highlightedIndex;
    for (let step = 0; step < filtered.length; step++) {
      next = (next + delta + filtered.length) % filtered.length;
      if (!filtered[next].disabled) {
        setHighlightedIndex(next);
        return;
      }
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      if (!open) openMenu();
      else if (event.key === 'ArrowDown') moveHighlight(1);
      else if (event.key === 'ArrowUp') moveHighlight(-1);
      else if (highlightedIndex >= 0 && filtered[highlightedIndex])
        selectOption(filtered[highlightedIndex]);
    }
  };

  const handlePopoverKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === 'Enter' && highlightedIndex >= 0 && filtered[highlightedIndex]) {
      event.preventDefault();
      selectOption(filtered[highlightedIndex]);
    }
  };

  const errorId = `${id}-error`;

  return (
    <div className="relative space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-rose-600">
              *
            </span>
          )}
        </label>
      )}

      <div className="relative">
        <select
          ref={nativeRef}
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          required={required}
          disabled={disabled}
          value={currentValue}
          onChange={() => {}}
          onInvalid={handleInvalid}
          {...rest}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0 w-full opacity-0"
        >
          {options.map((item, idx) => (
            <option key={`${item.value}:${idx}`} value={item.value} disabled={item.disabled}>
              {item.label}
            </option>
          ))}
        </select>

        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          title={title}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listboxId : undefined}
          aria-invalid={!!displayedError}
          aria-describedby={displayedError ? errorId : undefined}
          onClick={() => (open ? closeMenu(false) : openMenu())}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            'flex h-11 w-full items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3.5 text-left text-sm shadow-2xs transition-colors hover:border-slate-400 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500',
            open && 'border-brand-600 bg-white ring-2 ring-brand-100',
            displayedError && fieldInvalid,
            className
          )}
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              isPlaceholder ? 'text-slate-400' : 'text-slate-900'
            )}
          >
            {displayLabel}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-4 shrink-0 text-slate-400 transition-transform duration-150',
              open && 'rotate-180 text-brand-600'
            )}
          />
        </button>
      </div>

      {displayedError && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-rose-600"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{displayedError}</span>
        </p>
      )}

      {open &&
        position &&
        portalTarget &&
        createPortal(
          <div
            ref={popoverRef}
            onKeyDown={handlePopoverKeyDown}
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
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setHighlightedIndex(0);
                  }}
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
              aria-label={label ?? ariaLabel ?? 'Opções'}
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
                          if (!option.disabled) setHighlightedIndex(idx);
                        }}
                        onClick={() => selectOption(option)}
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
        )}
    </div>
  );
}
