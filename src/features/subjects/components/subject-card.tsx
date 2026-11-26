'use client';

import Link from 'next/link';
import { ChevronRight, Pencil } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { cn, countLabel, percent } from '@/lib/utils';
import { resolveSubjectIcon } from './subject-icons';
import { subjectCovers } from './subject-colors';
import { type Subject } from '@/models';
import type { SubjectSummary } from '../api';

export function SubjectCard({ subject, className, archived = false, progress, onEdit }: {
  subject: Subject & Partial<Pick<SubjectSummary, 'teachers' | 'hasUpdates' | 'className'>>;
  className?: string;
  archived?: boolean;
  progress?: { completed: number; total: number };
  onEdit?: () => void;
}) {
  const hasUpdates = subject.hasUpdates ?? false;
  const { Icon, value: icon } = resolveSubjectIcon(subject);
  const cover = subjectCovers[subject.color] ?? subjectCovers.violet;
  const pct = progress && progress.total > 0 ? percent(progress.completed, progress.total) : null;
  return <article className={cn('subject-card relative h-full min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm', archived && 'opacity-80')}>
    <Link href={`/disciplinas/detalhes?id=${encodeURIComponent(subject.id)}`} aria-label={`Abrir mural de ${subject.name}${hasUpdates ? ' · Novidades' : ''}${archived ? ' · Turma encerrada' : ''}`} className="flex h-full flex-col rounded-xl focus-visible:outline-offset-4">
      <div className="flex h-20 items-center justify-between rounded-t-xl px-5" style={cover}>
        <Icon aria-hidden="true" data-subject-icon={icon} className="size-9 shrink-0" strokeWidth={1.6} />
        {archived && <Badge tone="neutral">Encerrada</Badge>}
      </div>
      <div className={`flex flex-1 flex-col items-start gap-2 rounded-b-xl bg-white p-5 ${onEdit ? 'pr-14' : ''}`}>
        <div className="flex w-full items-center gap-2.5"><h3 className="min-w-0 text-xl font-semibold leading-6 tracking-tight text-slate-900 [overflow-wrap:anywhere]">{subject.name}</h3>{hasUpdates && !archived && <span aria-hidden="true" title="Novas publicações" className="size-2 shrink-0 rounded-full bg-brand-600" />}<ChevronRight aria-hidden="true" className="subject-card-arrow ml-auto size-4 shrink-0 text-slate-500" /></div>
        <p className="text-sm text-slate-500 [overflow-wrap:anywhere]">{className ?? subject.className}</p>
        <p className="text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">Equipe docente: {subject.teachers?.map(teacher => teacher.name).join(', ') || 'Aguardando atribuição'}</p>
        {progress && pct !== null && <div className="mt-auto w-full pt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>{progress.completed} de {countLabel(progress.total, 'material concluído', 'materiais concluídos')}</span>
            <span className="font-semibold tabular-nums text-slate-700">{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cover.color }} />
          </div>
        </div>}
      </div>
    </Link>
    {onEdit && <Button variant="ghost" aria-label={`Editar ${subject.name}`} onClick={onEdit} className="absolute bottom-2 right-2 bg-white/80"><Pencil aria-hidden="true" className="size-4" /></Button>}
  </article>;
}
