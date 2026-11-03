export function ActivityConditions({ activity }: { activity: { kind: 'quiz' | 'work'; required: boolean; deadline: string | null; allowLate: boolean } }) {
  return <p className="my-4 text-sm leading-7 text-slate-600">{activity.kind === 'work' ? 'Entrega de trabalho' : 'Questionário'} · {activity.required === false ? 'Opcional' : 'Obrigatória'} · {activity.deadline ? `Prazo: ${activity.deadline.replace('T', ' ')} (horário de Brasília) · ${activity.allowLate ? 'Aceita entrega atrasada' : 'Não aceita atraso'}` : 'Sem prazo'} · Um único envio</p>;
}
