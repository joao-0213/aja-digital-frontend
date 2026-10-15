'use client';

import Link from 'next/link';
import { ChevronRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui';
import { useSubjectUpdates } from '../hooks/use-subject-updates';
import { resolveSubjectIcon } from './subject-icons';
import { type Subject } from '@/models';

const covers = {
  violet: { background: '#f2e5f7', color: '#75218d' },
  blue: { background: '#e8eff8', color: '#345b88' },
  amber: { background: '#faf0d9', color: '#805b18' },
  green: { background: '#e5f1ea', color: '#32634a' }
};

export function SubjectCard({ subject, className, onEdit }: {
  subject: Subject;
  className?: string;
  onEdit?: () => void;
}) {
  const hasUpdates = useSubjectUpdates(subject.id);
  const { Icon, value: icon } = resolveSubjectIcon(subject);
  return <article className="subject-card relative h-full min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
    <Link href={`/disciplinas/detalhes?id=${subject.id}`} aria-label={`Abrir mural de ${subject.name}${hasUpdates ? ' · Novidades' : ''}`} className="flex h-full flex-col rounded-xl focus-visible:outline-offset-4">
      <div className="flex h-20 items-center rounded-t-xl px-5" style={covers[subject.color]}>
        <Icon aria-hidden="true" data-subject-icon={icon} className="size-9 shrink-0" strokeWidth={1.6} />
      </div>
      <div className={`flex flex-1 flex-col items-start gap-2 rounded-b-xl bg-white p-5 ${onEdit ? 'pr-14' : ''}`}>
        <div className="flex w-full items-center gap-2.5"><h3 className="text-xl font-semibold leading-6 tracking-tight text-slate-900">{subject.name}</h3>{hasUpdates && <span aria-hidden="true" title="Novas publicações" className="size-2 shrink-0 rounded-full bg-brand-600" />}<ChevronRight aria-hidden="true" className="subject-card-arrow ml-auto size-4 shrink-0 text-slate-500" /></div>
        <p className="text-sm text-slate-500">{className}</p>
      </div>
    </Link>
    {onEdit && <Button variant="ghost" aria-label={`Editar ${subject.name}`} onClick={onEdit} className="absolute bottom-2 right-2 bg-white/80"><Pencil aria-hidden="true" className="size-4" /></Button>}
  </article>;
}
