'use client';

import { useState } from 'react';
import { useApp } from '@/providers/app-context';
import { Button, Dialog, Input, Select } from '@/components/ui';
import { ConfirmAlert } from '@/components/shared/confirm-alert';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useHttpEditor } from '@/hooks/use-http-editor';
import type { SchoolClass } from '@/models';
import type { ClassFields } from '../api';
import { useClassesApi } from '../hooks/use-classes';

export type ClassSelection =
  | { action: 'edit'; record?: SchoolClass; intent: string }
  | { action: 'close' | 'reopen'; record: SchoolClass; intent: string };

/** Dialog for creating/editing school classes or confirming class deactivation/reactivation. */
export function ClassDialog({
  selection,
  close,
  saved
}: {
  selection: ClassSelection;
  close: () => void;
  saved: () => void;
}) {
  const { notify } = useApp();
  const api = useClassesApi();
  const { record, action, intent } = selection;
  const initial: ClassFields = {
    name: record?.name ?? '',
    code: record?.code ?? '',
    year: record?.year ?? new Date().getFullYear(),
    shift: record?.shift ?? 'Noite'
  };
  const state = useHttpEditor<ClassFields, SchoolClass>(
    initial,
    record?.revision ?? 0,
    'classes-fields'
  );
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [yearInput, setYearInput] = useState(() => String(state.fields.year));

  const closeEditor = () => {
    if (state.busy) return;
    if (confirmingClose) {
      setConfirmingClose(false);
      return;
    }
    if (action !== 'edit' || !state.dirty) {
      state.clear();
      close();
      return;
    }
    setConfirmingClose(true);
  };

  const save = async () => {
    const ok = await state.editor.submit(
      (fields, revision) =>
        selection.action === 'edit'
          ? api.save(
              { ...fields, name: fields.name.trim(), code: fields.code.trim().toUpperCase() },
              revision,
              selection.record?.id,
              intent
            )
          : api.command(selection.record.id, selection.action, revision, intent),
      record ? () => api.read(record.id) : undefined
    );
    if (ok) {
      state.clear();
      notify(
        action === 'edit' ? 'Turma salva.' : 'Situação da turma atualizada. Histórico preservado.'
      );
      saved();
    }
  };

  return (
    <Dialog
      open
      onClose={closeEditor}
      title={
        action === 'edit'
          ? record
            ? 'Editar turma'
            : 'Criar nova turma'
          : action === 'close'
            ? 'Inativar turma?'
            : 'Reativar turma?'
      }
    >
      {confirmingClose ? (
        <ConfirmAlert
          message="Fechar esta edição sem salvar as alterações da turma?"
          cancelLabel="Continuar editando"
          confirmLabel="Descartar alterações"
          onCancel={() => setConfirmingClose(false)}
          onConfirm={() => {
            state.clear();
            close();
          }}
        />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {selection.action === 'edit' ? (
            <fieldset disabled={state.busy} className="space-y-4">
              <Input
                label="Nome da turma"
                value={state.fields.name}
                onChange={(event) =>
                  state.editor.change({ ...state.fields, name: event.target.value })
                }
                required
                maxLength={100}
              />
              <Input
                label="Código único"
                value={state.fields.code}
                onChange={(event) =>
                  state.editor.change({ ...state.fields, code: event.target.value })
                }
                required
                pattern="[A-Za-z0-9-]+"
                maxLength={20}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Ano"
                  type="number"
                  value={yearInput}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setYearInput(raw);
                    if (raw !== '') state.editor.change({ ...state.fields, year: Number(raw) });
                  }}
                  min={2020}
                  max={2100}
                  required
                />
                <Select
                  label="Turno"
                  value={state.fields.shift}
                  onChange={(event) =>
                    state.editor.change({
                      ...state.fields,
                      shift: event.target.value as SchoolClass['shift']
                    })
                  }
                >
                  <option>Manhã</option>
                  <option>Tarde</option>
                  <option>Noite</option>
                </Select>
              </div>
            </fieldset>
          ) : (
            <p className="text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
              O histórico de {selection.record.name} será preservado. Inativar encerra vínculos e
              cancela matrículas pendentes; alunos perdem acesso. Reativar não restaura vínculos
              encerrados.
            </p>
          )}
          {state.conflicted && (
            <RecordConflict
              author="Equipe administrativa"
              updatedAt={state.latest?.updatedAt}
              onReviewed={state.editor.acknowledge}
            >
              <p>A turma mudou. Seu preenchimento foi mantido.</p>
              {state.latest ? (
                <p>
                  {state.latest.name} · {state.latest.code} · {state.latest.year} ·{' '}
                  {state.latest.shift} · {state.latest.active ? 'Ativa' : 'Inativa'}
                </p>
              ) : (
                record && (
                  <Button
                    variant="secondary"
                    onClick={() => void state.editor.review(() => api.read(record.id))}
                  >
                    Consultar versão atual
                  </Button>
                )
              )}
            </RecordConflict>
          )}
          {state.error && (
            <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
              {state.error}
            </p>
          )}
          {state.blocked && (
            <p className="text-sm text-slate-600">
              Feche esta janela e atualize a lista para conferir o que foi registrado antes de
              iniciar outra operação.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={state.busy} onClick={closeEditor}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={action === 'close' ? 'danger' : 'primary'}
              loading={state.busy}
              disabled={state.conflicted || state.blocked}
            >
              {action === 'edit' ? 'Salvar turma' : 'Confirmar'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
