'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes } from 'react';
import { AlertCircle, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { field, fieldInvalid } from './field-styles';
import { friendlyValidationMessage, isFirstInvalidInForm } from './field-validation';

export function Input({
  label,
  error,
  type,
  onChange,
  onInvalid,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState('');
  const displayedError = error || validationError;
  const isSearch = type === 'search';
  const isFile = type === 'file';
  const hasSearchValue = isSearch && typeof props.value === 'string' && props.value.length > 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the value prop is an intentional trigger to re-run validation after controlled updates
  useEffect(() => {
    if (!validationError) return;
    if (inputRef.current?.validity.valid) setValidationError('');
  }, [props.value, validationError]);

  const handleInvalid = (event: FormEvent<HTMLInputElement>) => {
    event.preventDefault();
    const message = friendlyValidationMessage(event.currentTarget);
    setValidationError(message);
    if (isFirstInvalidInForm(event.currentTarget)) event.currentTarget.focus();
    onInvalid?.(event);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (validationError) {
      setValidationError(event.currentTarget.validity.valid ? '' : friendlyValidationMessage(event.currentTarget));
    }
    onChange?.(event);
  };

  const clearSearch = () => {
    const el = inputRef.current;
    if (el) {
      el.value = '';
      onChange?.({ target: el, currentTarget: el } as ChangeEvent<HTMLInputElement>);
      el.focus();
    }
    setValidationError('');
  };

  const errorId = `${id}-error`;

  return <div className="space-y-1.5">
    {label && <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}
      {props.required && <span aria-hidden="true" className="ml-0.5 text-rose-600">*</span>}
    </label>}
    <div className="relative">
      {isSearch && <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />}
      <input
        ref={inputRef}
        id={id}
        type={isSearch ? 'text' : type}
        role={isSearch ? 'searchbox' : props.role}
        {...props}
        onChange={handleChange}
        onInvalid={handleInvalid}
        aria-invalid={!!displayedError}
        aria-describedby={displayedError ? errorId : undefined}
        className={cn(
          field,
          isSearch && 'pl-10 pr-9',
          isFile && 'cursor-pointer py-2 text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-50 file:px-3.5 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100',
          displayedError && fieldInvalid,
          className,
        )}
      />
      {hasSearchValue && !props.disabled && <button
        type="button"
        aria-label="Limpar busca"
        onClick={clearSearch}
        className="absolute right-2.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>}
    </div>
    {displayedError && <p id={errorId} role="alert" className="flex items-start gap-1.5 text-xs font-medium text-rose-600">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{displayedError}</span>
    </p>}
  </div>;
}
