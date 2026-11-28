'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type SelectHTMLAttributes
} from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldInvalid } from './field-styles';
import { friendlyValidationMessage, isFirstInvalidInForm } from './field-validation';
import { filterSelectOptions, parseSelectOptions, type ParsedSelectOption } from './select-options';
import {
  computeSelectPopoverPosition,
  SelectPopover,
  type SelectPopoverPosition
} from './select-popover';

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
  const options = useMemo(() => parseSelectOptions(children), [children]);
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
  const [position, setPosition] = useState<SelectPopoverPosition | null>(null);
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

  const filtered = useMemo(() => filterSelectOptions(options, query), [options, query]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPosition(computeSelectPopoverPosition(trigger, showSearch));
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

  const selectOption = (option: ParsedSelectOption) => {
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

      {open && position && portalTarget && (
        <SelectPopover
          portalTarget={portalTarget}
          popoverRef={popoverRef}
          searchRef={searchRef}
          listboxId={listboxId}
          ariaLabel={label ?? ariaLabel ?? 'Opções'}
          position={position}
          showSearch={showSearch}
          query={query}
          filtered={filtered}
          currentValue={currentValue}
          highlightedIndex={highlightedIndex}
          onQueryChange={(nextQuery) => {
            setQuery(nextQuery);
            setHighlightedIndex(0);
          }}
          onHighlight={setHighlightedIndex}
          onSelect={selectOption}
          onKeyDown={handlePopoverKeyDown}
        />
      )}
    </div>
  );
}
