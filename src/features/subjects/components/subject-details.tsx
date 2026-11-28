'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ListChecks,
  MessageSquare,
  Pencil,
  Plus
} from 'lucide-react';
import { ResponsiveDisclosure } from '@/components/ui/responsive-disclosure';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useSession } from '@/providers/app-context';
import { Button, Empty, ErrorState, LinkButton, Skeleton } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useEditableDialogSelection } from '@/hooks/use-editable-dialog-selection';
import { HttpError } from '@/lib/http-client';
import { countLabel } from '@/lib/utils';
import type { TrailModule } from '@/models';
import type { SubjectDetail } from '../api';
import { subjectKeys, useSubjectsApi } from '../hooks/use-subjects';
import { moduleOrderCommand } from '../lib/module-order';
import { useSubjectVisit } from '../hooks/use-subject-updates';
import { ModuleEditor, type ModuleSelection } from './module-editor';
import { ModuleMaterials, useMaterialsApi } from '@/features/materials';
import { AssessmentSummaries, useAssessmentsApi } from '@/features/assessments';
import { SubjectWall } from './subject-wall';
import { resolveSubjectIcon } from './subject-icons';
import { subjectCovers } from './subject-colors';
import { toErrorMessage } from '@/lib/errors';

function SubjectContent({ id, materialsView }: { id: string; materialsView: boolean }) {
  const { sessionKey, user } = useSession();
  const api = useSubjectsApi();
  const query = useHttpQuery(
    { sessionKey, key: subjectKeys.detail(id) },
    useCallback((signal) => api.read(id, signal), [api, id]),
    !!id
  );
  const materialsApi = useMaterialsApi();
  const subjectMaterials = useHttpQuery(
    { sessionKey, key: subjectKeys.materials(id) },
    useCallback((signal) => materialsApi.all({ subjectId: id }, signal), [materialsApi, id]),
    !!id && materialsView
  );
  const assessmentsApi = useAssessmentsApi();
  const activities = useHttpQuery(
    { sessionKey, key: subjectKeys.assessments(id) },
    useCallback(
      (signal) => assessmentsApi.all({ subjectId: id }, signal, sessionKey),
      [assessmentsApi, id, sessionKey]
    ),
    !!id && materialsView
  );
  const attempts = useHttpQuery(
    { sessionKey, key: subjectKeys.attempts(id) },
    useCallback(
      (signal) => assessmentsApi.allAttempts({}, signal, sessionKey),
      [assessmentsApi, sessionKey]
    ),
    !!id && materialsView
  );
  const submissions = useHttpQuery(
    { sessionKey, key: subjectKeys.submissions(id) },
    useCallback(
      (signal) => assessmentsApi.allSubmissions({}, signal, sessionKey),
      [assessmentsApi, sessionKey]
    ),
    !!id && materialsView
  );
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const {
    selection,
    open: openSelection,
    close
  } = useEditableDialogSelection<ModuleSelection>(`module-open:${id}`, `module-fields:${id}`);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderError, setReorderError] = useState('');
  const [reorderConflict, setReorderConflict] = useState(false);
  const [latestOrder, setLatestOrder] = useState<SubjectDetail | null>(null);
  const [acknowledgedOrder, setAcknowledgedOrder] = useState<{
    source: SubjectDetail;
    view: SubjectDetail;
  } | null>(null);
  const data =
    query.data && acknowledgedOrder?.source === query.data ? acknowledgedOrder.view : query.data;
  const visit = useSubjectVisit(data?.subject);
  if (!id)
    return (
      <Empty
        title="Selecione uma disciplina"
        action={<LinkButton href="/disciplinas">Ver disciplinas</LinkButton>}
      />
    );
  if (query.loading) return <Skeleton />;
  if (query.error)
    return (
      <>
        <ErrorState message={query.error.message} retry={() => void query.retry()} />
        <LinkButton href="/disciplinas">Ver disciplinas</LinkButton>
      </>
    );
  if (!data)
    return (
      <Empty
        title="Disciplina indisponível"
        action={<LinkButton href="/disciplinas">Ver disciplinas</LinkButton>}
      />
    );
  const { subject, modules, projections } = data;
  const canEdit = subject.canManageContent;
  const openModule = (record?: TrailModule) => {
    openSelection({ record, intent: crypto.randomUUID() });
  };
  const inspectOrder = async () => {
    try {
      setLatestOrder(await api.read(id));
    } catch (cause: unknown) {
      setReorderError(toErrorMessage(cause, 'Não foi possível consultar a ordem atual.'));
    }
  };
  const move = async (moduleId: string, direction: -1 | 1) => {
    if (reorderBusy || reorderConflict || !canEdit) return;
    const command = moduleOrderCommand(subject.revision ?? 1, modules, moduleId, direction);
    if (!command) return;
    setReorderBusy(true);
    setReorderError('');
    try {
      await api.reorderModules(id, command);
      // The command response may be paged; only the full detail can replace this set.
      await query.invalidate();
    } catch (cause: unknown) {
      setReorderError(
        toErrorMessage(cause, 'Não foi possível alterar a ordem. O conjunto anterior foi mantido.')
      );
      if (cause instanceof HttpError && cause.kind === 'conflict') {
        setReorderConflict(true);
        await inspectOrder();
      }
    } finally {
      setReorderBusy(false);
    }
  };
  const subjectQuery = encodeURIComponent(id);
  const cover = subjectCovers[subject.color] ?? subjectCovers.violet;
  const { Icon: SubjectIcon, value: iconName } = resolveSubjectIcon(subject);
  return (
    <>
      <LinkButton secondary href="/disciplinas" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar às disciplinas
      </LinkButton>
      <header className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div
          className="relative flex flex-wrap items-start justify-between gap-4 px-5 py-6 sm:px-7 sm:py-7"
          style={{ background: cover.background, color: cover.color }}
        >
          <div className="relative z-10 flex min-w-0 flex-1 items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/85 shadow-xs ring-1 ring-black/5">
              <SubjectIcon
                aria-hidden="true"
                data-subject-icon={iconName}
                className="size-8"
                strokeWidth={1.65}
              />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold tracking-wide [overflow-wrap:anywhere]">
                {subject.className}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">
                {subject.name}
              </h1>
              {subject.description && (
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">
                  {subject.description}
                </p>
              )}
            </div>
          </div>
          {canEdit && materialsView && (
            <div className="relative z-10">
              <Button
                variant={editing ? 'primary' : 'secondary'}
                aria-pressed={editing}
                onClick={() => setEditing(!editing)}
              >
                <Pencil aria-hidden="true" className="size-4" />
                {editing ? 'Concluir organização' : 'Organizar módulos'}
              </Button>
            </div>
          )}
          <SubjectIcon
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-6 right-6 hidden size-36 text-white sm:block"
            strokeWidth={1.2}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 bg-white px-5 py-3.5 text-sm sm:px-7">
          <span className="text-slate-500">
            Equipe docente:{' '}
            <span className="font-medium text-slate-800">
              {subject.teachers.map((teacher) => teacher.name).join(', ') ||
                'Sem docentes atribuídos'}
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 sm:ml-auto">
            <Link
              href={`/forum?disciplina=${subjectQuery}`}
              className="inline-flex min-h-10 items-center gap-2 font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-900"
            >
              <MessageSquare aria-hidden="true" className="size-4" />
              Dúvidas da turma
            </Link>
            {canEdit && (
              <Link
                href={`/frequencia?disciplina=${subjectQuery}`}
                className="inline-flex min-h-10 items-center gap-2 font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-900"
              >
                <ListChecks aria-hidden="true" className="size-4" />
                Fazer chamada
              </Link>
            )}
          </div>
        </div>
      </header>
      {visit.error && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"
        >
          <p>Sua visita não foi registrada. As novidades foram mantidas. {visit.error.message}</p>
          <Button variant="secondary" onClick={() => void visit.retry()}>
            Tentar registrar visita novamente
          </Button>
        </div>
      )}
      {visit.hasUpdates && (
        <p className="mb-4 text-sm text-brand-700">Há publicações novas nesta disciplina.</p>
      )}
      <nav aria-label="Seções da disciplina" className="mb-6 flex gap-6 border-b border-slate-200">
        {[
          {
            label: 'Mural',
            href: `/disciplinas/detalhes?id=${subjectQuery}`,
            active: !materialsView
          },
          {
            label: 'Materiais e atividades',
            href: `/disciplinas/detalhes?id=${subjectQuery}&aba=materiais`,
            active: materialsView
          }
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={tab.active ? 'page' : undefined}
            className={`min-h-12 border-b-2 px-1 py-3 text-sm font-semibold ${tab.active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {!materialsView ? (
        <SubjectWall subject={subject} />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[210px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-6">
            <ResponsiveDisclosure title="Nesta disciplina">
              <nav aria-label="Índice de módulos" className="flex flex-wrap gap-2 xl:flex-col">
                {modules.map((mod, index) => (
                  <a
                    key={mod.id}
                    href={`#module-${mod.id}`}
                    onClick={() =>
                      setCollapsed((current) => current.filter((value) => value !== mod.id))
                    }
                    className="flex min-h-11 items-start gap-3 rounded-lg px-3 py-3 text-sm leading-5 text-slate-600 [overflow-wrap:anywhere] hover:bg-brand-50 hover:text-brand-700"
                  >
                    <span className="font-semibold tabular-nums text-brand-600">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">{mod.title}</span>
                  </a>
                ))}
              </nav>
              {canEdit && (
                <Button variant="ghost" className="mt-3" onClick={() => openModule()}>
                  <Plus aria-hidden="true" className="size-4" />
                  Novo módulo
                </Button>
              )}
            </ResponsiveDisclosure>
          </aside>
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Materiais e atividades</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {countLabel(
                    subjectMaterials.data
                      ? subjectMaterials.data.length
                      : projections.materials.count,
                    'material',
                    'materiais'
                  )}{' '}
                  ·{' '}
                  {countLabel(
                    activities.data ? activities.data.length : projections.assessments.count,
                    'atividade',
                    'atividades'
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => setCollapsed(collapsed.length ? [] : modules.map((mod) => mod.id))}
              >
                {collapsed.length ? 'Expandir módulos' : 'Recolher módulos'}
              </Button>
            </div>
            {reorderError && (
              <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                {reorderError}
              </p>
            )}
            {reorderConflict && (
              <RecordConflict
                author="Equipe docente"
                updatedAt={latestOrder?.subject.updatedAt}
                onReviewed={() => {
                  if (!latestOrder || !query.data) return;
                  setAcknowledgedOrder({ source: query.data, view: latestOrder });
                  setReorderConflict(false);
                  setReorderError('');
                  setLatestOrder(null);
                }}
              >
                <p>
                  A ordem anterior foi mantida. Confira a sequência atual antes de fazer um novo
                  movimento.
                </p>
                {latestOrder ? (
                  <ol className="list-inside list-decimal">
                    {latestOrder.modules.map((mod) => (
                      <li key={mod.id}>{mod.title}</li>
                    ))}
                  </ol>
                ) : (
                  <Button variant="secondary" onClick={() => void inspectOrder()}>
                    Consultar ordem atual
                  </Button>
                )}
              </RecordConflict>
            )}
            {modules.map((mod, index) => {
              const open = !collapsed.includes(mod.id);
              return (
                <section
                  id={`module-${mod.id}`}
                  key={mod.id}
                  className="module-section overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <div className="flex flex-wrap items-center gap-2 bg-slate-50/70 p-4 sm:px-5">
                    <h3 className="min-w-0 flex-1">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`content-${mod.id}`}
                        className="flex w-full items-center gap-3 text-left"
                        onClick={() =>
                          setCollapsed((current) =>
                            open
                              ? [...current, mod.id]
                              : current.filter((value) => value !== mod.id)
                          )
                        }
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-sm font-semibold text-brand-700">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 font-semibold text-slate-900 [overflow-wrap:anywhere]">
                          {mod.title}
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className={`size-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
                        />
                      </button>
                    </h3>
                    {canEdit && editing && (
                      <div className="flex items-center">
                        <Button
                          variant="ghost"
                          aria-label={`Editar módulo ${mod.title}`}
                          onClick={() => openModule(mod)}
                        >
                          <Pencil aria-hidden="true" className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={index === 0 || reorderBusy || reorderConflict}
                          aria-label={`Mover ${mod.title} para cima`}
                          onClick={() => void move(mod.id, -1)}
                        >
                          <ChevronUp aria-hidden="true" className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={index === modules.length - 1 || reorderBusy || reorderConflict}
                          aria-label={`Mover ${mod.title} para baixo`}
                          onClick={() => void move(mod.id, 1)}
                        >
                          <ChevronDown aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div id={`content-${mod.id}`} hidden={!open}>
                    {mod.description && (
                      <p className="px-5 pt-4 text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">
                        {mod.description}
                      </p>
                    )}
                    <ModuleMaterials
                      module={mod}
                      canEdit={canEdit}
                      editing={editing}
                      onChanged={() => {
                        void query.invalidate();
                        void subjectMaterials.invalidate();
                      }}
                    />
                    <AssessmentSummaries
                      module={mod}
                      items={activities.data ?? []}
                      attempts={attempts.data ?? []}
                      submissions={submissions.data ?? []}
                      canManage={canEdit}
                      studentId={user?.role === 'student' ? user.id : undefined}
                      loading={activities.loading}
                      error={activities.error}
                      retry={() => void activities.retry()}
                      attemptsLoading={attempts.loading}
                      attemptsError={attempts.error}
                      retryAttempts={() => void attempts.retry()}
                      submissionsLoading={submissions.loading}
                      submissionsError={submissions.error}
                      retrySubmissions={() => void submissions.retry()}
                    />
                  </div>
                </section>
              );
            })}
            {!modules.length && (
              <Empty
                title="Nenhum módulo cadastrado"
                description={
                  canEdit
                    ? 'Crie o primeiro módulo para organizar os conteúdos das aulas.'
                    : 'Os módulos serão exibidos após a publicação pelo professor.'
                }
                action={
                  canEdit && <Button onClick={() => openModule()}>Criar primeiro módulo</Button>
                }
              />
            )}
          </div>
        </div>
      )}
      {selection && canEdit && (
        <ModuleEditor
          key={selection.intent}
          subjectId={id}
          selection={selection}
          close={close}
          saved={() => {
            close();
            void query.invalidate();
          }}
        />
      )}
    </>
  );
}

export function SubjectDetails() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  return <SubjectContent key={id} id={id} materialsView={params.get('aba') === 'materiais'} />;
}
