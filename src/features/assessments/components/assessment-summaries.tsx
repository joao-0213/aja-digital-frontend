'use client';

import { ClipboardCheck, Plus } from 'lucide-react';
import { Badge, Empty, LinkButton } from '@/components/ui';
import type { TrailModule } from '@/models';
import type { AssessmentRead } from '../api';

function isStaffAssessment(activity: AssessmentRead): activity is Extract<AssessmentRead, { questionIds: string[] }> {
  return 'questionIds' in activity;
}

function deadlineLabel(value: string | null) {
  if (!value) return 'Sem prazo';
  return `Até ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))} (Brasília)`;
}

export function AssessmentSummaries({
  module,
  items,
  canManage,
  loading = false,
  error,
  retry
}: {
  module: TrailModule;
  items: AssessmentRead[];
  canManage: boolean;
  loading?: boolean;
  error?: Error;
  retry?: () => void;
}) {
  const activities = items.filter(item => item.moduleId === module.id);
  return <section aria-label={`Atividades do módulo ${module.title}`} className="border-t border-slate-100 px-5 py-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck aria-hidden="true" className="size-4 text-brand-700" />Atividades</h4>
      {canManage && <LinkButton secondary href={`/questionarios/criar?modulo=${encodeURIComponent(module.id)}`}><Plus aria-hidden="true" className="size-4" />Criar atividade</LinkButton>}
    </div>
    {loading ? <p role="status" className="py-3 text-sm text-slate-500">Carregando atividades…</p> : error ? <div role="alert" className="space-y-2 text-sm"><p className="text-rose-700">{error.message}</p>{retry && <button type="button" onClick={retry} className="min-h-11 font-medium text-brand-700">Tentar novamente</button>}</div> : !activities.length ? <Empty title="Nenhuma atividade neste módulo" description={canManage ? 'Crie um rascunho para preparar a próxima atividade.' : 'As atividades serão exibidas após a publicação.'} /> : <ul className="space-y-3">{activities.map(activity => {
      const staff = isStaffAssessment(activity);
      const questionCount = staff ? activity.questionIds.length : activity.questionCount;
      const assigned = staff || activity.assigned;
      return <li key={activity.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-200 p-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2"><p className="font-medium">{activity.title}</p><Badge tone={activity.status === 'draft' ? 'neutral' : !assigned ? 'amber' : 'green'}>{activity.status === 'draft' ? 'Rascunho' : !assigned ? 'Somente consulta' : 'Publicada'}</Badge></div>
          <p className="text-xs text-slate-500">{activity.kind === 'work' ? 'Entrega de trabalho' : `${questionCount} ${questionCount === 1 ? 'questão' : 'questões'}`} · {activity.required ? 'Obrigatória' : 'Opcional'} · {deadlineLabel(activity.deadline)}</p>
        </div>
        <LinkButton secondary href={`/questionarios?id=${encodeURIComponent(activity.id)}`}>Detalhes</LinkButton>
        {canManage && <LinkButton secondary href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}>{activity.status === 'draft' ? 'Reabrir rascunho' : 'Editar atividade'}</LinkButton>}
      </li>;
    })}</ul>}
  </section>;
}
