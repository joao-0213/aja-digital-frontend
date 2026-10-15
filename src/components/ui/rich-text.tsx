'use client';

import { useId, useRef } from 'react';
import { Bold, Italic, List } from 'lucide-react';
import { Button } from '@/components/ui';
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
  return <div className="space-y-2">
    <label htmlFor={id} className="text-sm font-medium">
      {label}
    </label>
    <div className="overflow-hidden rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-brand-100">
      <div className="flex gap-1 border-b border-slate-100 bg-slate-50 p-1" role="toolbar" aria-label="Formatação de texto">
        <Button variant="ghost" className="!min-h-9 !px-3" aria-label="Negrito" onClick={() => wrap('**', '**')}>
          <Bold className="size-4" />
        </Button>
        <Button variant="ghost" className="!min-h-9 !px-3" aria-label="Itálico" onClick={() => wrap('*', '*')}>
          <Italic className="size-4" />
        </Button>
        <Button variant="ghost" className="!min-h-9 !px-3" aria-label="Inserir item de lista" onClick={() => wrap('\n- ', '')}>
          <List className="size-4" />
        </Button>
      </div>
      <textarea ref={ref} id={id} rows={5} value={value} onChange={e => onChange(e.target.value)} required minLength={10} placeholder={placeholder} className="w-full resize-y bg-white p-4 text-base leading-7 outline-none" />
    </div>
    <p className="text-xs text-slate-400">Formatação simples: **negrito**, *itálico* e listas com hífen.</p>
  </div>;
}
export function RichText({
  text
}: {
  text: string;
}) {
  return <div className="space-y-3 whitespace-pre-wrap leading-7 text-slate-600">
    {text.split('\n').filter(Boolean).map((line, i) => <p key={i} className={line.startsWith('- ') ? 'ml-5 list-item' : ''}>
      {(line.startsWith('- ') ? line.slice(2) : line).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, j) => part.startsWith('**') && part.endsWith('**') ? <strong key={j}>
        {part.slice(2, -2)}
      </strong> : part.startsWith('*') && part.endsWith('*') ? <em key={j}>
        {part.slice(1, -1)}
      </em> : part)}
    </p>)}
  </div>;
}
