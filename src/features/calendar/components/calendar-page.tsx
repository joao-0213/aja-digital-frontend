'use client';

import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, Plus } from 'lucide-react';
import { Badge, Button, Card, Dialog, LinkButton, PageHeading } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { cn, dateLabel } from '@/lib/utils';
import { AnnouncementComposer } from '@/features/announcements';
import { createCalendarApi, type CalendarDto } from '../api';

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const MAX_VISIBLE_EVENTS_PER_DAY = 2;

export function CalendarPage() {
  const { client, sessionKey, user } = useSession();
  const api = useMemo(() => createCalendarApi(client), [client]);
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelected] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const from = dayKey(month), to = dayKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const query = useHttpQuery({ sessionKey, key: `calendar:${from}:${to}` }, useCallback(signal => api.range(from, to, signal), [api, from, to]));
  const entries = query.data ?? [];
  const selected = entries.find(item => item.id === selectedId);
  const visible = useMemo(
    () => entries.filter(item => filter === 'all' || filter === 'exam' && item.source === 'assessment' || filter === 'event' && item.source === 'announcement'),
    [entries, filter],
  );
  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarDto[]>();
    for (const item of visible) {
      const list = grouped.get(item.date);
      if (list) list.push(item);
      else grouped.set(item.date, [item]);
    }
    return grouped;
  }, [visible]);
  const expandedItems = expandedDate ? (itemsByDate.get(expandedDate) ?? []) : [];
  const start = month.getDay();
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((start + total) / 7) * 7;
  const change = (delta: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const today = dayKey(new Date());
  const colors = { class: 'bg-blue-50 text-blue-700 border-blue-100', exam: 'bg-amber-50 text-amber-800 border-amber-100', event: 'bg-brand-50 text-brand-700 border-brand-100' };
  const timeLabel = (item: CalendarDto) => item.allDay ? 'Dia inteiro' : item.time ?? 'Horário não informado';
  return <>
    <LinkButton secondary href="/" className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />Voltar ao painel</LinkButton>
    <PageHeading title="Calendário" action={user?.role !== 'student' && <Button onClick={() => setCreating(true)}><Plus aria-hidden="true" className="size-4" />Novo evento</Button>} />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <Button variant="secondary" aria-label="Mês anterior" onClick={() => change(-1)}><ChevronLeft aria-hidden="true" className="size-4" /></Button>
        <h2 className="min-w-0 flex-1 text-center text-lg font-semibold sm:min-w-44 sm:flex-none">{month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
        <Button variant="secondary" aria-label="Próximo mês" onClick={() => change(1)}><ChevronRight aria-hidden="true" className="size-4" /></Button>
        <Button variant="ghost" className="w-full sm:w-auto" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); }}>Hoje</Button>
      </div>
      <div className="flex flex-wrap gap-2">{[['all', 'Tudo'], ['exam', 'Prazos de atividades'], ['event', 'Acontecimentos']].map(([id, label]) => <Button key={id} variant={filter === id ? 'primary' : 'secondary'} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</Button>)}</div>
    </div>
    {query.loading && <p role="status" className="mb-4 text-sm text-slate-500">Carregando calendário…</p>}
    {query.error && <p role="alert" className="mb-4 text-sm text-red-700">{query.error.message} <button type="button" className="font-bold underline underline-offset-4" onClick={query.retry}>Tentar novamente</button></p>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section aria-label="Calendário mensal" className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <div className="py-3 text-center text-xs font-semibold text-slate-400" key={day}>{day}</div>)}</div>
        <div className="grid grid-cols-7">{Array.from({ length: cells }, (_, index) => {
          const day = index - start + 1, date = `${from.slice(0, 7)}-${String(day).padStart(2, '0')}`, inMonth = day >= 1 && day <= total;
          const dayItems = inMonth ? (itemsByDate.get(date) ?? []) : [];
          const shownItems = dayItems.slice(0, MAX_VISIBLE_EVENTS_PER_DAY);
          const hiddenCount = dayItems.length - shownItems.length;
          return <div key={index} className={cn('min-h-28 min-w-0 border-b border-r border-slate-100 p-2', !inMonth && 'bg-slate-50/60')}>
            {inMonth && <><span className={cn('mb-2 inline-flex size-7 items-center justify-center rounded-full text-xs font-medium', date === today ? 'bg-brand-600 text-white' : 'text-slate-500')}>{day}</span><div className="space-y-1">{shownItems.map(item => <button type="button" key={item.id} onClick={() => setSelected(item.id)} className={cn('block w-full rounded border p-1.5 text-left text-xs leading-4', colors[item.kind])}><span className="block font-semibold">{timeLabel(item)}</span><span className="line-clamp-2 [overflow-wrap:anywhere]">{item.title}</span></button>)}{hiddenCount > 0 && <button type="button" onClick={() => setExpandedDate(date)} className="block w-full rounded px-1.5 py-1 text-left text-xs font-bold text-brand-700 underline underline-offset-2 hover:bg-brand-50">+{hiddenCount} mais</button>}</div></>}
          </div>;
        })}</div>
      </section>
      <aside><Card><h2 className="mb-5 text-lg font-semibold">Neste mês</h2><div className="max-h-[36rem] space-y-3 overflow-y-auto pr-1">{visible.map(item => <button type="button" key={item.id} onClick={() => setSelected(item.id)} className="flex w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-slate-50"><span className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg text-lg font-bold', colors[item.kind])}>{item.date.slice(-2)}</span><span className="min-w-0"><span className="block text-sm font-medium leading-5 [overflow-wrap:anywhere]">{item.title}</span><span className="mt-1 block text-xs text-slate-400">{dateLabel(item.date)} · {timeLabel(item)}</span></span></button>)}{!query.loading && !query.error && !visible.length && <p className="py-8 text-sm leading-6 text-slate-400">Nenhum compromisso neste mês com o filtro selecionado.</p>}</div></Card></aside>
    </div>
    <Dialog open={!!expandedDate} onClose={() => setExpandedDate(null)} title={expandedDate ? `Compromissos de ${dateLabel(expandedDate, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Compromissos do dia'}>
      <div className="space-y-2">
        {expandedItems.map(item => <button type="button" key={item.id} onClick={() => { setExpandedDate(null); setSelected(item.id); }} className={cn('block w-full rounded-lg border p-3 text-left text-sm', colors[item.kind])}><span className="block text-xs font-semibold">{timeLabel(item)}</span><span className="mt-1 block font-medium [overflow-wrap:anywhere]">{item.title}</span></button>)}
      </div>
    </Dialog>
    <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? 'Compromisso'}>{selected && <>
      <Badge tone={selected.source === 'assessment' ? 'amber' : 'purple'}>{selected.source === 'assessment' ? 'Atividade' : 'Acontecimento'}</Badge>
      <p className="my-5 flex items-center gap-2 text-sm text-slate-500"><CalendarDays aria-hidden="true" className="size-4" />{dateLabel(selected.date, { day: 'numeric', month: 'long', year: 'numeric' })} · {timeLabel(selected)}</p>
      <p className="mb-6 whitespace-pre-wrap break-words leading-7 text-slate-600">{selected.description}</p>
      <LinkButton href={selected.href}>{selected.source === 'announcement' ? 'Ler aviso de origem' : 'Abrir atividade'}</LinkButton>
    </>}</Dialog>
    {creating && <AnnouncementComposer defaultCalendar onClose={() => { setCreating(false); void query.invalidate(); }} />}
  </>;
}
