'use client';

import { useApp } from '@/providers/app-context';
import { Button, Card } from '@/components/ui';

/** The account survives a failed resolution; login and reload resume this step. */
export function EnrollmentStatus() {
  const { db, user, mutate, busy } = useApp();
  if (user.role !== 'student') return null;
  const pending = db.enrollments.filter(e => e.status === 'pending' && !e.deletedAt && e.email === user.email.trim().toLowerCase());
  const active = db.enrollments.filter(e => e.studentId === user.id && e.status === 'active' && !e.deletedAt);
  if (active.length > 1) return <Card className="mb-6 space-y-3"><h2 className="font-semibold">Regularização de matrícula necessária</h2><p className="text-sm leading-6 text-slate-600">Os dados antigos têm vínculos em mais de uma turma ativa. Peça à administração para conferir as turmas e encerrar explicitamente o vínculo incorreto. Os registros foram preservados; o acesso acadêmico aguarda essa regularização, sem transferência automática.</p></Card>;
  if (user.emailConfirmedAt === null || pending.length) return <Card className="mb-6 space-y-4">
    <h2 className="font-semibold">{user.emailConfirmedAt === null ? 'Confirme seu e-mail' : 'Concluir matrícula pendente'}</h2>
    <p className="break-words text-sm leading-6 text-slate-600">Conta criada para {user.email}. Confirmação simulada neste navegador: nenhum e-mail será enviado e não há verificação real de identidade.</p>
    <p className="text-sm leading-6 text-slate-600">{pending.length > 1 ? 'Há pendências em mais de uma turma. Peça ao administrador para cancelar o destino incorreto antes de continuar. Sua conta permanece disponível.' : pending.length ? 'Existe uma matrícula pendente para este e-mail. A confirmação libera a turma se o vínculo continuar válido.' : 'Após confirmar, aguarde a inclusão pelo administrador. Confirmar o e-mail ou preencher o perfil não cria uma matrícula.'}</p>
    <Button loading={busy} disabled={pending.length > 1} onClick={() => void mutate(() => {}, 'E-mail confirmado em simulação. Confira sua situação de matrícula.', { enrollment: { type: 'confirm' } })}>{user.emailConfirmedAt === null ? 'Confirmar e-mail em simulação' : 'Tentar concluir matrícula'}</Button>
  </Card>;
  if (!db.classes.some(c => c.active && c.studentIds.includes(user.id))) return <Card className="mb-6 space-y-3">
    <h2 className="font-semibold">Aguardando inclusão em turma</h2>
    <p className="break-words text-sm leading-6 text-slate-600">Informe {user.email} à administração do cursinho para regularizar sua matrícula. Não é necessário completar outros campos do perfil. Se um vínculo foi encerrado, seu acesso à turma terminou; o histórico permanece com a equipe autorizada.</p>
  </Card>;
  const enrollment = active.find(e => !e.legacy);
  return enrollment ? <Card className="mb-6"><h2 className="font-semibold">Matrícula ativa — {db.classes.find(c => c.id === enrollment.classId)?.name}</h2><p className="mt-2 text-sm text-slate-600">Efetivada em {new Date(enrollment.enrolledAt!).toLocaleString('pt-BR')}. As atividades consideram a data da sua entrada.</p></Card> : null;
}
