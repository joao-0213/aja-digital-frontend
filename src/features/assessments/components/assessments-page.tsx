'use client';

import { useState } from 'react';
import { ClipboardCheck, Plus, Clock3 } from 'lucide-react';
import { PublicationDate } from '@/components/ui/publication-date';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Empty, LinkButton, PageHeading } from '@/components/ui';
import { dateLabel } from '@/lib/utils';

export function AssessmentsPage() {
  const {
    db,
    user,
    role
  } = useApp();
  const [filter, setFilter] = useState('all');
  const items = db.assessments.filter(a => (role !== 'student' || a.status === 'published') && (filter === 'all' || (filter === 'done' ? db.attempts.some(t => t.assessmentId === a.id && t.userId === user.id && t.submittedAt) : !db.attempts.some(t => t.assessmentId === a.id && t.userId === user.id && t.submittedAt))));
  return <>
    <PageHeading title="Questionários" description="Consulte os prazos, responda às atividades e veja seus resultados." action={role !== 'student' && <LinkButton href="/questionarios/criar"><Plus className="size-4" />Criar questionário</LinkButton>} />
    <div role="group" aria-label="Filtrar questionários" className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {[['all', 'Todos'], ['pending', 'Para fazer'], ['done', 'Respondidos']].map(([id, label]) => <Button key={id} variant="ghost" aria-pressed={filter === id} className={filter === id ? 'bg-brand-100 !text-brand-700' : undefined} onClick={() => setFilter(id)}>
        {label}
      </Button>)}
    </div>
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.map(a => {
        const mod = db.modules.find(m => m.id === a.moduleId);
        const sub = db.subjects.find(s => s.id === mod?.subjectId);
        const attempts = db.attempts.filter(t => t.assessmentId === a.id && t.userId === user.id && t.submittedAt);
        const last = attempts.at(-1);
        return <Card key={a.id} className="flex flex-col">
        <div className="mb-5 flex items-center justify-between">
          <ClipboardCheck aria-hidden="true" className="size-5 text-slate-500" />
          <Badge tone={a.status === 'draft' ? 'neutral' : last ? 'green' : 'amber'}>
            {a.status === 'draft' ? 'Rascunho' : last ? 'Respondido' : 'Disponível'}
          </Badge>
        </div>
        <p className="text-xs text-slate-400">{sub?.name} · Módulo {mod?.order}</p>
        <h2 className="mb-2 mt-2 text-lg font-semibold">
          {a.title}
        </h2>
        <p className="mb-5 flex-1 text-sm leading-6 text-slate-500">
          {a.description}
        </p>
        <div className="mb-5 space-y-2 text-sm text-slate-500">
          <p>{a.questionIds.length} {a.questionIds.length === 1 ? 'questão' : 'questões'} · {a.attempts} {a.attempts === 1 ? 'tentativa' : 'tentativas'}</p>
          <p className="text-xs text-slate-500"><PublicationDate value={a.publishedAt} /></p>
          <p className="flex items-center gap-2"><Clock3 className="size-4" />Até {dateLabel(a.deadline)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.status === 'draft' ? <LinkButton secondary href={`/questionarios/criar?id=${a.id}`}>Editar rascunho</LinkButton> : <LinkButton href={`/questionarios/responder?id=${a.id}`}>
            {last ? 'Ver tentativas' : 'Começar'}
          </LinkButton>}
          {last && <LinkButton secondary href={`/questionarios/resultado?id=${last.id}`}>Resultado</LinkButton>}
        </div>
      </Card>;
      })}
    </div>
    {!items.length && <Empty title="Nenhum questionário nesta lista" description="Suas atividades aparecerão aqui quando estiverem disponíveis." />}
  </>;
}
