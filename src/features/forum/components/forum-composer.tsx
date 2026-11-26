'use client';

import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { BookOpen, Check, ChevronDown, Link2, Paperclip, Search, Tag, X } from 'lucide-react';
import { Button, Dialog, Input, Textarea } from '@/components/ui';
import { cn, textMatch } from '@/lib/utils';
import type { ForumAttachmentDto } from '../api';
import { ForumAttachments } from './forum-attachments';

type SubjectOption = { id: string; name: string; classId: string; className?: string };
type LegacyForumAttachment = { id: string; name: string; mime: string; size: number };

function SubjectCombobox({
  value,
  options,
  disabled,
  onChange,
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
  const selected = options.find(item => item.id === value);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const onPointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
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
    return options.filter(item => textMatch(`${item.name} ${item.className ?? ''}`, trimmed));
  }, [options, query]);

  return <div ref={containerRef} className="relative space-y-1.5">
    <span className="block text-sm font-medium text-slate-700">
      Disciplina<span aria-hidden="true" className="ml-0.5 text-rose-600">*</span>
    </span>
    <button
      type="button"
      disabled={disabled}
      aria-label="Selecionar disciplina"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-controls={open ? listboxId : undefined}
      onClick={() => setOpen(prev => !prev)}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-xl border px-3.5 py-2 text-left transition-colors disabled:opacity-50',
        selected
          ? 'border-brand-200 bg-brand-50/40 hover:border-brand-300 hover:bg-brand-50/70'
          : 'border-slate-300 bg-white hover:border-slate-400',
      )}
    >
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500')}>
        <BookOpen aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        {selected ? <>
          <span className="block truncate text-sm font-medium text-slate-900">{selected.name}</span>
          {selected.className && <span className="block truncate text-xs text-slate-500">{selected.className}</span>}
        </> : <span className="text-sm text-slate-400">Selecione uma disciplina</span>}
      </span>
      <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
    </button>

    {open && <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      {options.length >= 4 && <div className="relative border-b border-slate-100 bg-slate-50/70 p-2">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchRef}
          type="text"
          role="searchbox"
          aria-label="Buscar disciplina"
          placeholder="Buscar disciplina ou turma…"
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {query && <button type="button" aria-label="Limpar busca de disciplina" onClick={() => setQuery('')} className="absolute right-3.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X aria-hidden="true" className="size-3" /></button>}
      </div>}
      <ul id={listboxId} role="listbox" aria-label="Disciplinas disponíveis" className="max-h-52 divide-y divide-slate-100 overflow-y-auto py-1">
        {filtered.map(option => {
          const active = option.id === value;
          return <li key={option.id} role="option" aria-selected={active}>
            <button
              type="button"
              onClick={() => { onChange(option.id); setOpen(false); }}
              className={cn(
                'flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
                active ? 'bg-brand-50/70 text-brand-900' : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm', active ? 'font-semibold text-brand-900' : 'font-medium text-slate-900')}>{option.name}</span>
                {option.className && <span className="block truncate text-xs text-slate-500">{option.className}</span>}
              </span>
              <span aria-hidden="true" className={cn('flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors', active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-transparent')}>
                <Check className="size-3.5" strokeWidth={2.5} />
              </span>
            </button>
          </li>;
        })}
        {filtered.length === 0 && <li className="px-3.5 py-3 text-xs text-slate-500">Nenhuma disciplina encontrada.</li>}
      </ul>
    </div>}
  </div>;
}

function TagsInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const chips = useMemo(() => [...new Set(value.split(',').map(tag => tag.trim()).filter(Boolean))].slice(0, 5), [value]);

  const commit = (raw: string) => {
    const pieces = raw.split(',').map(item => item.trim().replace(/^#+/, '')).filter(Boolean);
    if (!pieces.length) { setDraft(''); return; }
    const next = [...new Set([...chips, ...pieces])].slice(0, 5);
    onChange(next.join(', '));
    setDraft('');
  };

  const remove = (target: string) => {
    onChange(chips.filter(item => item !== target).join(', '));
  };

  return <div className="space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">Tags <span className="font-normal text-slate-400">(opcional)</span></label>
      <span className="text-xs text-slate-400 tabular-nums">{chips.length}/5</span>
    </div>
    <div className={cn(
      'flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 transition-colors focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100',
      disabled && 'bg-slate-50 opacity-60',
    )}>
      <Tag aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
      {chips.map(tag => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-brand-900">
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
      </span>)}
      {chips.length < 5 && <input
        id={inputId}
        type="text"
        disabled={disabled}
        value={draft}
        placeholder={chips.length ? 'Adicionar tag…' : 'Ex.: proporção, exercício (Enter para adicionar)'}
        onChange={event => {
          const next = event.target.value;
          if (next.includes(',')) commit(next);
          else setDraft(next);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(draft);
          } else if (event.key === 'Backspace' && !draft && chips.length) {
            remove(chips[chips.length - 1]);
          }
        }}
        onBlur={() => { if (draft.trim()) commit(draft); }}
        className="min-w-[140px] flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />}
    </div>
  </div>;
}

export function ForumComposerDialog({
  open,
  onClose,
  subjects,
  targetSubject,
  onChangeSubject,
  title,
  onChangeTitle,
  body,
  onChangeBody,
  tags,
  onChangeTags,
  reference,
  onClearReference,
  attachment,
  legacyAttachment,
  onClearLegacyAttachment,
  fileInputVersion,
  onChooseFile,
  onRemoveFile,
  readFileContent,
  draftError,
  error,
  busy,
  hasPendingCreate,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  subjects: readonly SubjectOption[];
  targetSubject: string;
  onChangeSubject: (id: string) => void;
  title: string;
  onChangeTitle: (value: string) => void;
  body: string;
  onChangeBody: (value: string) => void;
  tags: string;
  onChangeTags: (value: string) => void;
  reference: string;
  onClearReference: () => void;
  attachment?: ForumAttachmentDto;
  legacyAttachment?: LegacyForumAttachment;
  onClearLegacyAttachment: () => void;
  fileInputVersion: number;
  onChooseFile: (file?: File) => void;
  onRemoveFile: () => void;
  readFileContent: (id: string, inline: boolean) => Promise<Blob>;
  draftError: string;
  error: string;
  busy: boolean;
  hasPendingCreate: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  const fileId = useId();
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy || !targetSubject || hasPendingCreate) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onChooseFile(dropped);
  };

  return <Dialog open={open} onClose={onClose} title="Fazer uma pergunta">
    <form onSubmit={onSubmit} className="space-y-5">
      <fieldset disabled={busy || hasPendingCreate} className="space-y-4">
        <SubjectCombobox
          value={targetSubject}
          options={subjects}
          disabled={busy || hasPendingCreate}
          onChange={onChangeSubject}
        />

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">Título da pergunta<span aria-hidden="true" className="ml-0.5 text-rose-600">*</span></span>
            <span className="text-xs text-slate-400 tabular-nums">{title.length}/180</span>
          </div>
          <Input
            aria-label="Título da pergunta"
            placeholder="Ex.: Como montar uma regra de três composta?"
            value={title}
            onChange={event => onChangeTitle(event.target.value)}
            required
            minLength={8}
            maxLength={180}
          />
        </div>

        <Textarea
          label="Conte sua dúvida"
          placeholder="Descreva o ponto em que travou, o que já tentou fazer ou qual parte ficou confusa…"
          value={body}
          onChange={event => onChangeBody(event.target.value)}
          required
          minLength={10}
          rows={5}
        />

        <TagsInput value={tags} disabled={busy || hasPendingCreate} onChange={onChangeTags} />

        {reference && <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-2.5 text-sm text-brand-900">
          <span className="inline-flex items-center gap-2 font-medium">
            <Link2 aria-hidden="true" className="size-4 text-brand-600" />
            Referência vinculada: {reference.startsWith('material:') ? 'Material da disciplina' : 'Questão do banco'}
          </span>
          <button type="button" aria-label="Remover referência vinculada" onClick={onClearReference} className="inline-flex size-6 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200/60">
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>}

        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700">Anexo <span className="font-normal text-slate-400">(opcional)</span></span>
          {!attachment ? <label
            htmlFor={fileId}
            onDragOver={event => { event.preventDefault(); if (!busy && targetSubject && !hasPendingCreate) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              'flex cursor-pointer items-center gap-3.5 rounded-xl border border-dashed px-4 py-3.5 transition-colors',
              dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/70 hover:border-brand-300 hover:bg-brand-50/40',
              (busy || !targetSubject || hasPendingCreate) && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              key={fileInputVersion}
              id={fileId}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              disabled={busy || !targetSubject || hasPendingCreate}
              onChange={event => onChooseFile(event.target.files?.[0])}
              className="sr-only"
            />
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100/80 text-brand-700">
              <Paperclip aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-800">{busy ? 'Enviando anexo…' : 'Clique para anexar ou arraste um arquivo'}</span>
              <span className="mt-0.5 block text-xs text-slate-500">PDF, PNG, JPEG ou WebP · até 5 MB</span>
            </span>
          </label> : <ForumAttachments item={attachment} readContent={readFileContent} onRemove={onRemoveFile} />}
        </div>

        {legacyAttachment && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">O anexo legado “{legacyAttachment.name}” foi preservado no rascunho local e não será enviado automaticamente. Selecione o arquivo novamente para anexá-lo a esta publicação. <Button type="button" variant="ghost" onClick={onClearLegacyAttachment}>Remover da composição</Button></p>}
        {draftError && <p role="alert" className="text-sm text-rose-700">{draftError}</p>}
      </fieldset>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" type="button" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={busy || !targetSubject} loading={busy}>{hasPendingCreate ? 'Tentar publicar novamente' : 'Publicar pergunta'}</Button>
      </div>
    </form>
  </Dialog>;
}
