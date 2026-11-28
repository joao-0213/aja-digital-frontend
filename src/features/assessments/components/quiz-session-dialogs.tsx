'use client';

import { Button, Dialog } from '@/components/ui';
import { countLabel } from '@/lib/utils';
import type { AttemptStudent } from '../api';
import { displayQuizChoice } from '../hooks/quiz-session-state';

export function QuizConflictPanel({
  conflict,
  snapshotChanged,
  onDiscardLocal,
  onApplyLocal
}: {
  conflict: AttemptStudent;
  snapshotChanged: boolean;
  onDiscardLocal: () => void;
  onApplyLocal: () => void;
}) {
  return (
    <section
      aria-labelledby="attempt-conflict-title"
      className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <h2 id="attempt-conflict-title" className="font-semibold">
        Confira as respostas salvas antes de continuar
      </h2>
      <p className="mt-2">
        As respostas que você estava editando continuam preservadas. A versão atual do servidor foi
        consultada na revisão {conflict.revision}:
      </p>
      <ol className="my-3 list-decimal space-y-1 pl-5">
        {conflict.questionOrder.map((id, position) => (
          <li key={id}>
            Questão {position + 1}: {displayQuizChoice(conflict, id, conflict.answers[id])}
          </li>
        ))}
      </ol>
      {snapshotChanged ? (
        <Button variant="secondary" onClick={onDiscardLocal}>
          Conferi a nova revisão; recarregar questões atuais
        </Button>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onDiscardLocal}>
            Descartar minha edição e carregar respostas salvas
          </Button>
          <Button onClick={onApplyLocal}>Conferi as salvas; usar minhas respostas</Button>
        </div>
      )}
    </section>
  );
}

export function QuizSessionDialogs({
  confirm,
  submitBusy,
  answeredCount,
  totalQuestions,
  remaining,
  lockInputs,
  hasConflict,
  hasFrozenIntent,
  reloadPrompt,
  onCloseConfirm,
  onSubmit,
  onCloseReload,
  onReload
}: {
  confirm: boolean;
  submitBusy: boolean;
  answeredCount: number;
  totalQuestions: number;
  remaining: number;
  lockInputs: boolean;
  hasConflict: boolean;
  hasFrozenIntent: boolean;
  reloadPrompt: string | null;
  onCloseConfirm: () => void;
  onSubmit: () => void;
  onCloseReload: () => void;
  onReload: () => void;
}) {
  return (
    <>
      <Dialog open={confirm} onClose={onCloseConfirm} title="Enviar suas respostas?">
        <p className="mb-5 leading-7 text-slate-600">
          Você respondeu {answeredCount} de {countLabel(totalQuestions, 'questão', 'questões')}.
          Após o envio confirmado, as respostas não poderão ser alteradas.
        </p>
        {remaining > 0 && (
          <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            {remaining === 1
              ? 'Há 1 questão em branco. Ela será enviada como não respondida e não receberá pontos.'
              : `Há ${remaining} questões em branco. Elas serão enviadas como não respondidas e não receberão pontos.`}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" disabled={submitBusy} onClick={onCloseConfirm}>
            Revisar
          </Button>
          <Button loading={submitBusy} disabled={lockInputs || hasConflict} onClick={onSubmit}>
            {hasFrozenIntent ? 'Confirmar o mesmo envio' : 'Confirmar envio'}
          </Button>
        </div>
      </Dialog>
      <Dialog open={!!reloadPrompt} onClose={onCloseReload} title="Recarregar revisão atual?">
        <p className="mb-5 text-sm leading-6 text-slate-600">{reloadPrompt}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onCloseReload}>
            Cancelar
          </Button>
          <Button onClick={onReload}>Recarregar</Button>
        </div>
      </Dialog>
    </>
  );
}
