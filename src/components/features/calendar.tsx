'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useApp } from '@/components/providers';
import { Badge, Button, Card, Dialog, Empty, LinkButton, PageHeading } from '@/components/ui';
import { cn, dateLabel } from '@/lib/utils';
import type { CalendarEvent } from '@/models';
type Entry = CalendarEvent & {
  assessmentId?: string;
};
export function CalendarPage() {
  const {
    db
  } = useApp();
  const [month, setMonth] = useState(9);
  const [year, setYear] = useState(2026);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Entry | null>(null);
  const entries: Entry[] = [...db.events, ...db.assessments.filter(a => a.status === 'published').map(a => ({
    id: a.id,
    assessmentId: a.id,
    title: a.title,
    kind: 'exam' as const,
    date: a.deadline.slice(0, 10),
    time: a.deadline.slice(11),
    description: a.description
  }))];
  const visible = entries.filter(e => (filter === 'all' || e.kind === filter) && Number(e.date.slice(0, 4)) === year && Number(e.date.slice(5, 7)) === month + 1).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const start = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((start + total) / 7) * 7;
  const change = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setMonth(next.getMonth());
    setYear(next.getFullYear());
  };
  const colors = {
    class: 'bg-blue-50 text-blue-700 border-blue-100',
    exam: 'bg-amber-50 text-amber-800 border-amber-100',
    event: 'bg-brand-50 text-brand-700 border-brand-100'
  };
  return <>
    <PageHeading title="Calendário" description="Consulte as datas das aulas, atividades e avaliações." />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <Button variant="secondary" aria-label="Mês anterior" onClick={() => change(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="min-w-0 flex-1 text-center text-lg font-semibold sm:min-w-44 sm:flex-none">
          {new Date(year, month, 1).toLocaleDateString('pt-BR', {
            month: 'long',
            year: 'numeric'
          })}
        </h2>
        <Button variant="secondary" aria-label="Próximo mês" onClick={() => change(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" className="w-full sm:w-auto" onClick={() => {
          setMonth(9);
          setYear(2026);
        }}>Mês de exemplo</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {[['all', 'Tudo'], ['class', 'Aulas'], ['exam', 'Avaliações'], ['event', 'Eventos']].map(([id, label]) => <Button key={id} variant={filter === id ? 'primary' : 'secondary'} aria-pressed={filter === id} onClick={() => setFilter(id)}>
          {label}
        </Button>)}
      </div>
    </div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section aria-label="Calendário mensal" className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <div className="py-3 text-center text-xs font-semibold text-slate-400" key={day}>
            {day}
          </div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({
            length: cells
          }, (_, i) => {
            const day = i - start + 1;
            const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const inMonth = day >= 1 && day <= total;
            return <div key={i} className={cn('min-h-28 min-w-0 border-b border-r border-slate-100 p-2', !inMonth && 'bg-slate-50/60')}>
            {inMonth && <>
              <span className={cn('mb-2 inline-flex size-7 items-center justify-center rounded-full text-xs font-medium', date === '2026-10-05' ? 'bg-brand-600 text-white' : 'text-slate-500')}>
                {day}
              </span>
              <div className="space-y-1">
                {visible.filter(e => e.date === date).map(e => <button key={e.id} onClick={() => setSelected(e)} className={cn('block w-full rounded border p-1.5 text-left text-xs leading-4', colors[e.kind])}>
                  <span className="block font-semibold">
                    {e.time}
                  </span>
                  <span className="line-clamp-2">
                    {e.title}
                  </span>
                </button>)}
              </div>
            </>}
          </div>;
          })}
        </div>
      </section>
      <aside>
        <Card>
          <h2 className="mb-5 text-lg font-semibold">Neste mês</h2>
          <div className="space-y-3">
            {visible.map(e => <button key={e.id} onClick={() => setSelected(e)} className="flex w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-slate-50">
              <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg text-lg font-bold', colors[e.kind])}>
                {e.date.slice(-2)}
              </span>
              <span>
                <span className="block text-sm font-medium leading-5">
                  {e.title}
                </span>
                <span className="mt-1 block text-xs text-slate-400">{dateLabel(e.date)} · {e.time}</span>
              </span>
            </button>)}
            {!visible.length && <p className="py-8 text-sm leading-6 text-slate-400">Nenhum compromisso neste mês com o filtro selecionado.</p>}
          </div>
        </Card>
        <p className="mt-4 text-xs leading-5 text-slate-400">Dados demonstrativos de outubro de 2026. O dia em destaque é a data de referência, 05/10.</p>
      </aside>
    </div>
    <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? 'Compromisso'}>
      {selected && <>
        <Badge tone={selected.kind === 'exam' ? 'amber' : selected.kind === 'class' ? 'blue' : 'purple'}>
          {selected.kind === 'exam' ? 'Avaliação' : selected.kind === 'class' ? 'Aula' : 'Evento'}
        </Badge>
        <p className="my-5 flex items-center gap-2 text-sm text-slate-500"><CalendarDays className="size-4" />{dateLabel(selected.date, {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })} · {selected.time}</p>
        <p className="mb-6 leading-7 text-slate-600">
          {selected.description}
        </p>
        {selected.assessmentId && <LinkButton href={`/questionarios/responder?id=${selected.assessmentId}`}>Abrir questionário</LinkButton>}
      </>}
    </Dialog>
  </>;
}
