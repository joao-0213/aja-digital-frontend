'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { HttpError } from '@/lib/http-client';
import { toErrorMessage } from '@/lib/errors';
import type { AttendanceLesson, AttendanceRoster } from '../api';
import { useAttendanceApi } from './use-attendance';

function todayInBrasilia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function isAbortError(cause: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      cause instanceof DOMException &&
      cause.name === 'AbortError') ||
    (cause instanceof Error && cause.name === 'AbortError')
  );
}

export interface AttendanceSessionState {
  subjectId: string;
  canManageContent: boolean;
  date: string;
  time: string;
  roster?: AttendanceRoster;
  lesson?: AttendanceLesson;
  records: Record<string, boolean>;
  expectedRevision: number;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  confirm: boolean;
  conflictLesson?: AttendanceLesson;
  error: string;
}

export type AttendanceSessionApi = Pick<
  ReturnType<typeof useAttendanceApi>,
  'eligible' | 'lesson' | 'read' | 'create' | 'update'
>;

export interface AttendanceSessionControllerOptions {
  api: AttendanceSessionApi;
  subjectId: string;
  canManageContent: boolean;
  initialDate?: string;
  initialTime?: string;
  onSaved: () => void;
  onInvalidateRecent: () => void;
}

export function createAttendanceSessionController(options: AttendanceSessionControllerOptions) {
  let currentOptions = options;
  const listeners = new Set<() => void>();
  let requestVersion = 0;
  let loadedSelection = '';
  let activeController: AbortController | null = null;

  let state: AttendanceSessionState = {
    subjectId: options.subjectId,
    canManageContent: options.canManageContent,
    date: options.initialDate ?? '',
    time: options.initialTime ?? '19:00',
    roster: undefined,
    lesson: undefined,
    records: {},
    expectedRevision: 0,
    loaded: false,
    loading: false,
    saving: false,
    confirm: false,
    conflictLesson: undefined,
    error: ''
  };

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setState = (patch: Partial<AttendanceSessionState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const selectionOf = (subjectId: string, date: string, time: string) =>
    `${subjectId}\u0000${date}\u0000${time}`;

  const currentSelection = () => selectionOf(state.subjectId, state.date, state.time);

  const abortInFlight = () => {
    activeController?.abort();
    activeController = null;
  };

  const invalidateSelection = () => {
    abortInFlight();
    requestVersion += 1;
    loadedSelection = '';
    setState({
      loading: false,
      saving: false,
      loaded: false,
      confirm: false,
      roster: undefined,
      lesson: undefined,
      records: {},
      expectedRevision: 0,
      conflictLesson: undefined,
      error: ''
    });
  };

  const load = async (targetDate = state.date, targetTime = state.time) => {
    if (!state.subjectId || !targetDate || !targetTime) return false;
    if (targetDate !== state.date || targetTime !== state.time) {
      state = { ...state, date: targetDate, time: targetTime };
    }
    const requestedSelection = selectionOf(state.subjectId, targetDate, targetTime);
    abortInFlight();
    const controller = new AbortController();
    activeController = controller;
    const version = ++requestVersion;
    loadedSelection = '';
    setState({ loading: true, error: '', conflictLesson: undefined });
    try {
      const [nextRoster, page] = await Promise.all([
        currentOptions.api.eligible(state.subjectId, targetDate, targetTime, controller.signal),
        currentOptions.api.lesson(state.subjectId, targetDate, targetTime, controller.signal)
      ]);
      if (
        controller.signal.aborted ||
        version !== requestVersion ||
        currentSelection() !== requestedSelection
      ) {
        return false;
      }
      const current = page.find((item) => item.date === targetDate && item.time === targetTime);
      const eligible = nextRoster.filter((item) => item.eligible);
      loadedSelection = requestedSelection;
      setState({
        roster: {
          items: eligible.map((item) => ({ ...item, present: current?.records?.[item.id] ?? null }))
        },
        lesson: current,
        records: current
          ? { ...current.records }
          : Object.fromEntries(eligible.map((item) => [item.id, true])),
        expectedRevision: current?.revision ?? 0,
        loaded: true,
        loading: false
      });
      return true;
    } catch (cause: unknown) {
      if (
        controller.signal.aborted ||
        isAbortError(cause) ||
        version !== requestVersion ||
        currentSelection() !== requestedSelection
      ) {
        return false;
      }
      setState({
        error: toErrorMessage(cause, 'Não foi possível consultar a chamada.'),
        loaded: false,
        loading: false
      });
      return false;
    }
  };

  const inspectLatest = async () => {
    const requestedSelection = currentSelection();
    const version = requestVersion;
    abortInFlight();
    const controller = new AbortController();
    activeController = controller;
    try {
      const latest = state.lesson
        ? await currentOptions.api.read(state.lesson.id, controller.signal)
        : (
            await currentOptions.api.lesson(
              state.subjectId,
              state.date,
              state.time,
              controller.signal
            )
          ).find((item) => item.date === state.date && item.time === state.time);
      if (
        controller.signal.aborted ||
        version !== requestVersion ||
        currentSelection() !== requestedSelection
      ) {
        return;
      }
      if (!latest) {
        setState({ error: 'Não há chamada atual para conferir. Seu preenchimento foi mantido.' });
        return;
      }
      setState({ conflictLesson: latest, lesson: latest, error: '' });
    } catch (cause: unknown) {
      if (
        controller.signal.aborted ||
        isAbortError(cause) ||
        version !== requestVersion ||
        currentSelection() !== requestedSelection
      ) {
        return;
      }
      setState({
        error:
          cause instanceof Error
            ? `${cause.message} Seu preenchimento foi mantido.`
            : 'Não foi possível consultar a versão atual. Seu preenchimento foi mantido.'
      });
    }
  };

  const save = async () => {
    const requestedSelection = currentSelection();
    if (
      state.saving ||
      state.conflictLesson ||
      !state.canManageContent ||
      !state.loaded ||
      loadedSelection !== requestedSelection
    ) {
      return false;
    }
    if (
      state.lesson &&
      (state.lesson.subjectId !== state.subjectId ||
        state.lesson.date !== state.date ||
        state.lesson.time !== state.time)
    ) {
      return false;
    }
    const version = requestVersion;
    setState({ saving: true, error: '' });
    try {
      const saved = state.lesson
        ? await currentOptions.api.update(state.lesson.id, state.records, state.expectedRevision)
        : await currentOptions.api.create({
            subjectId: state.subjectId,
            date: state.date,
            time: state.time,
            records: state.records
          });
      if (version !== requestVersion || currentSelection() !== requestedSelection) return false;
      setState({
        lesson: saved,
        expectedRevision: saved.revision,
        conflictLesson: undefined,
        confirm: false,
        loaded: true,
        saving: false
      });
      currentOptions.onSaved();
      currentOptions.onInvalidateRecent();
      return true;
    } catch (cause: unknown) {
      if (version !== requestVersion || currentSelection() !== requestedSelection) return false;
      setState({
        error:
          cause instanceof Error
            ? `${cause.message} Seu preenchimento foi mantido.`
            : 'Não foi possível salvar. Seu preenchimento foi mantido.',
        saving: false,
        ...(cause instanceof HttpError && cause.kind === 'conflict' ? { confirm: false } : {})
      });
      if (cause instanceof HttpError && cause.kind === 'conflict') {
        await inspectLatest();
      }
      return false;
    }
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    updateOptions: (nextOptions: AttendanceSessionControllerOptions) => {
      const subjectChanged = state.subjectId !== nextOptions.subjectId;
      currentOptions = nextOptions;
      if (subjectChanged) {
        invalidateSelection();
      }
      if (
        state.subjectId !== nextOptions.subjectId ||
        state.canManageContent !== nextOptions.canManageContent
      ) {
        setState({
          subjectId: nextOptions.subjectId,
          canManageContent: nextOptions.canManageContent
        });
      }
    },
    dispose: () => {
      abortInFlight();
      requestVersion += 1;
    },
    invalidateSelection,
    setDate: (date: string) => {
      invalidateSelection();
      setState({ date });
    },
    setTime: (time: string) => {
      invalidateSelection();
      setState({ time });
    },
    initDate: (date: string) => {
      if (!state.date) setState({ date });
    },
    load,
    openSavedLesson: (item: AttendanceLesson) => {
      setState({ date: item.date, time: item.time });
      return load(item.date, item.time);
    },
    setStudentPresence: (studentId: string, present: boolean) => {
      setState({ records: { ...state.records, [studentId]: present } });
    },
    markAllPresent: () => {
      const students = state.roster?.items ?? [];
      setState({ records: Object.fromEntries(students.map((student) => [student.id, true])) });
    },
    markAllAbsent: () => {
      const students = state.roster?.items ?? [];
      setState({ records: Object.fromEntries(students.map((student) => [student.id, false])) });
    },
    setConfirm: (confirm: boolean) => setState({ confirm }),
    resolveConflict: () => {
      if (!state.conflictLesson) return;
      setState({
        expectedRevision: state.conflictLesson.revision,
        lesson: state.conflictLesson,
        conflictLesson: undefined
      });
    },
    save
  };
}

export function useAttendanceSession({
  subjectId,
  canManageContent,
  onSaved,
  onInvalidateRecent
}: {
  subjectId: string;
  canManageContent: boolean;
  onSaved: () => void;
  onInvalidateRecent: () => void;
}) {
  const api = useAttendanceApi();
  const controllerRef = useRef<ReturnType<typeof createAttendanceSessionController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createAttendanceSessionController({
      api,
      subjectId,
      canManageContent,
      onSaved,
      onInvalidateRecent
    });
  }
  const controller = controllerRef.current;

  useEffect(() => {
    controller.initDate(todayInBrasilia());
  }, [controller]);

  useEffect(() => {
    controller.updateOptions({
      api,
      subjectId,
      canManageContent,
      onSaved,
      onInvalidateRecent
    });
  }, [api, canManageContent, controller, onInvalidateRecent, onSaved, subjectId]);

  useEffect(() => () => controller.dispose(), [controller]);

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  return {
    ...state,
    invalidateSelection: controller.invalidateSelection,
    setDate: controller.setDate,
    setTime: controller.setTime,
    load: (targetDate?: string, targetTime?: string) =>
      void controller.load(targetDate, targetTime),
    openSavedLesson: (item: AttendanceLesson) => void controller.openSavedLesson(item),
    setStudentPresence: controller.setStudentPresence,
    markAllPresent: controller.markAllPresent,
    markAllAbsent: controller.markAllAbsent,
    setConfirm: controller.setConfirm,
    resolveConflict: controller.resolveConflict,
    save: () => void controller.save()
  };
}
