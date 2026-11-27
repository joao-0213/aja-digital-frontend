'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type TextareaHTMLAttributes
} from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { field, fieldInvalid } from './field-styles';
import { friendlyValidationMessage, isFirstInvalidInForm } from './field-validation';

export function Textarea({
  label,
  error,
  onChange,
  onInvalid,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [validationError, setValidationError] = useState('');
  const displayedError = error || validationError;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the value prop is an intentional trigger to re-run validation after controlled updates
  useEffect(() => {
    if (!validationError) return;
    if (textareaRef.current?.validity.valid) setValidationError('');
  }, [props.value, validationError]);

  const handleInvalid = (event: FormEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const message = friendlyValidationMessage(event.currentTarget);
    setValidationError(message);
    if (isFirstInvalidInForm(event.currentTarget)) event.currentTarget.focus();
    onInvalid?.(event);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (validationError) {
      setValidationError(
        event.currentTarget.validity.valid ? '' : friendlyValidationMessage(event.currentTarget)
      );
    }
    onChange?.(event);
  };

  const errorId = `${id}-error`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {props.required && (
          <span aria-hidden="true" className="ml-0.5 text-rose-600">
            *
          </span>
        )}
      </label>
      <textarea
        ref={textareaRef}
        id={id}
        rows={4}
        {...props}
        onChange={handleChange}
        onInvalid={handleInvalid}
        aria-invalid={!!displayedError}
        aria-describedby={displayedError ? errorId : undefined}
        className={cn(field, 'resize-y leading-6', displayedError && fieldInvalid, className)}
      />
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
    </div>
  );
}
