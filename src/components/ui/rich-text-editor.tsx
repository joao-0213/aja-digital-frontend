'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Bold, Italic, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { friendlyValidationMessage, isFirstInvalidInForm } from './field-validation';

/** Small, deliberately limited text editor. All output remains escaped React text. */
export function RichTextEditor({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!validationError) return;
    if (ref.current?.validity.valid) setValidationError('');
  }, [value, validationError]);

  const wrap = (before: string, after: string) => {
    const node = ref.current;
    if (!node) return;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const selected = value.slice(start, end) || 'texto';
    onChange(value.slice(0, start) + before + selected + after + value.slice(end));
    requestAnimationFrame(() => {
      node.focus();
      node.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}
      <span aria-hidden="true" className="ml-0.5 text-rose-600">*</span>
    </label>
    <div className={cn(
      'overflow-hidden rounded-xl border bg-white shadow-2xs transition-colors focus-within:ring-2',
      validationError
        ? 'border-rose-400 focus-within:border-rose-500 focus-within:ring-rose-100'
        : 'border-slate-300 focus-within:border-brand-600 focus-within:ring-brand-100',
    )}>
      <div className="flex gap-1 border-b border-slate-100 bg-slate-50 p-1" role="toolbar" aria-label="Formatação de texto">
        <Button variant="ghost" className="!min-h-9 !px-3" aria-label="Negrito" onClick={() => wrap('**', '**')}>
          <Bold aria-hidden="true" className="size-4" />
        </Button>
        <Button variant="ghost" className="!min-h-9 !px-3" aria-label="Itálico" onClick={() => wrap('*', '*')}>
          <Italic aria-hidden="true" className="size-4" />
        </Button>
        <Button variant="ghost" className="!min-h-9 !px-3" aria-label="Inserir item de lista" onClick={() => wrap('\n- ', '')}>
          <List aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <textarea
        ref={ref}
        id={id}
        rows={5}
        value={value}
        onChange={event => {
          if (validationError) setValidationError(event.currentTarget.validity.valid ? '' : friendlyValidationMessage(event.currentTarget));
          onChange(event.target.value);
        }}
        onInvalid={event => {
          event.preventDefault();
          setValidationError(friendlyValidationMessage(event.currentTarget));
          if (isFirstInvalidInForm(event.currentTarget)) event.currentTarget.focus();
        }}
        required
        minLength={10}
        placeholder={placeholder}
        aria-invalid={!!validationError}
        className="w-full resize-y bg-white p-3.5 text-sm leading-6 text-slate-900 placeholder:text-slate-400 outline-none"
      />
    </div>
    {validationError && <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-rose-600">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{validationError}</span>
    </p>}
    <p className="text-xs text-slate-500">Formatação simples: **negrito**, *itálico* e listas com hífen.</p>
  </div>;
}
