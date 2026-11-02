'use client';

import { useState } from 'react';
import { ClipboardCheck, Plus, Clock3 } from 'lucide-react';
import { PublicationDate } from '@/components/ui/publication-date';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Empty, LinkButton, PageHeading } from '@/components/ui';
import { dateLabel } from '@/lib/utils';
import { isAssessmentAssigned } from '@/lib/enrollment';

export function AssessmentsPage() {
  const {
    db,
    user,
    role
  } = useApp();
  const [filter, setFilter] = useState('all');
  const items = db.assessments.filter(a => (role !== 'student' || a.status === 'published') && (filter === 'all' || (filter === 'done' ? db.attempts.some(t => t.assessmentId === a.id && t.userId === user.id && t.submittedAt) : isAssessmentAssigned(db, a, user.id) && !db.attempts.some(t => t.assessmentId === a.id && t.userId === user.id && t.submittedAt))));
  return <>
    <PageHeading title="Atividades" description="Consulte as práticas complementares das disciplinas, seus prazos e envios." action={role !== 'student' && <LinkButton href="/questionarios/criar"><Plus className="size-4" />Criar questionário</LinkButton>} />
    {role === 'student' && <div role="group" aria-label="Filtrar atividades" className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {[['all', 'Todas'], ['pending', 'Para fazer'], ['done', 'Entregues']].map(([id, label]) => <Button key={id} variant="ghost" aria-pressed={filter === id} className={filter === id ? 'bg-brand-100 !text-brand-700' : undefined} onClick={() => setFilter(id)}>
        {label}
      </Button>)}
    </div>}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.map(a => {
        const mod = db.modules.find(m => m.id === a.moduleId);
        const sub = db.subjects.find(s => s.id === mod?.subjectId);
        const attempts = db.attempts.filter(t => t.assessmentId === a.id && t.userId === user.id && t.submittedAt);
        const last = attempts.at(-1);
        const consultOnly = role === 'student' && !isAssessmentAssigned(db, a, user.id);
        return <Card key={a.id} className="flex flex-col">
        <div className="mb-5 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-slate-500"><ClipboardCheck aria-hidden="true" className="size-5" />Questionário</span>
          <Badge tone={a.status === 'draft' ? 'neutral' : last ? 'green' : 'amber'}>
            {a.status === 'draft' ? 'Rascunho' : consultOnly ? 'Somente consulta' : last ? 'Entregue' : 'Disponível'}
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
          <p>{a.questionIds.length} {a.questionIds.length === 1 ? 'questão' : 'questões'} · envio único</p>
          <p className="text-xs text-slate-500"><PublicationDate value={a.publishedAt} /></p>
          <p className="flex items-center gap-2"><Clock3 className="size-4" />{a.deadline ? `Até ${dateLabel(a.deadline)}` : 'Sem prazo'}</p>
          <p>{a.required === false ? 'Prática opcional' : 'Obrigatória'}{consultOnly && ' · Prazo anterior à matrícula'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.status === 'draft' ? <LinkButton secondary href={`/questionarios/criar?id=${a.id}`}>Editar rascunho</LinkButton> : <LinkButton href={`/questionarios/responder?id=${a.id}`}>
            {role !== 'student' ? 'Consultar envios' : consultOnly ? 'Consultar atividade' : last ? 'Ver envios' : 'Começar'}
          </LinkButton>}
          {role !== 'student' && a.status === 'published' && <LinkButton secondary href={`/questionarios/criar?id=${a.id}`}>Editar atividade</LinkButton>}
          {last && <LinkButton secondary href={`/questionarios/resultado?id=${last.id}`}>Resultado</LinkButton>}
        </div>
      </Card>;
      })}
    </div>
    {!items.length && <Empty title="Nenhuma atividade nesta lista" description="Suas atividades aparecerão aqui quando estiverem disponíveis." />}
  </>;
}
