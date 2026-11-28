'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  PlayCircle
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorState,
  Input,
  LinkButton,
  PageHeading,
  Select,
  Skeleton
} from '@/components/ui';
import { countLabel, textMatch } from '@/lib/utils';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import type { MaterialKind } from '@/models';
import type { MaterialDto } from '../api';
import { useMaterialsApi } from '../hooks/use-materials';

type MaterialEntry = MaterialDto & { subjectId: string; subjectName: string; className: string };

const kindLabel: Record<MaterialKind, string> = {
  lesson: 'Leitura',
  pdf: 'Documento',
  video: 'Videoaula'
};

function KindIcon({ kind }: { kind: MaterialKind }) {
  if (kind === 'pdf') return <FileText aria-hidden="true" className="size-4 text-brand-700" />;
  if (kind === 'video') return <PlayCircle aria-hidden="true" className="size-4 text-brand-700" />;
  return <BookOpen aria-hidden="true" className="size-4 text-brand-700" />;
}

export function MaterialLibrary() {
  const { user, sessionKey } = useSession();
  const api = useMaterialsApi();
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('all');
  const [kind, setKind] = useState<'all' | MaterialKind>('all');

  const catalog = useHttpQuery(
    { sessionKey, key: ['materials', 'library'] },
    useCallback(
      async (signal) => {
        const subjects = await api.subjects(signal);
        const lists = await Promise.all(
          subjects.map(async (subject) => {
            const materials = await api.all({ subjectId: subject.id }, signal);
            return materials.map(
              (item) =>
                ({
                  ...item,
                  subjectId: subject.id,
                  subjectName: subject.name,
                  className: subject.className
                }) satisfies MaterialEntry
            );
          })
        );
        return { subjects, items: lists.flat() };
      },
      [api]
    )
  );

  const progress = useHttpQuery(
    { sessionKey, key: ['materials', 'library-progress'] },
    useCallback((signal) => api.allProgress(undefined, signal), [api]),
    user?.role === 'student'
  );

  const completedIds = useMemo(
    () =>
      new Set(
        (progress.data ?? []).filter((item) => item.completed).map((item) => item.materialId)
      ),
    [progress.data]
  );

  const filtered = useMemo(() => {
    const items = catalog.data?.items ?? [];
    const term = search.trim();
    return items.filter((item) => {
      if (subjectId !== 'all' && item.subjectId !== subjectId) return false;
      if (kind !== 'all' && item.kind !== kind) return false;
      if (term && !textMatch(`${item.title} ${item.content} ${item.subjectName}`, term))
        return false;
      return true;
    });
  }, [catalog.data?.items, kind, search, subjectId]);

  const subjects = catalog.data?.subjects ?? [];
  const hasFilters = !!search.trim() || subjectId !== 'all' || kind !== 'all';

  return (
    <>
      <LinkButton secondary href="/" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar ao painel
      </LinkButton>
      <PageHeading
        title="Materiais"
        action={
          <LinkButton secondary href="/disciplinas">
            Ver disciplinas
          </LinkButton>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Input
          label="Buscar material"
          placeholder="Título ou assunto"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          label="Disciplina"
          value={subjectId}
          onChange={(event) => setSubjectId(event.target.value)}
        >
          <option value="all">Todas as disciplinas</option>
          {subjects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Select
          label="Tipo"
          value={kind}
          onChange={(event) => setKind(event.target.value as 'all' | MaterialKind)}
        >
          <option value="all">Todos os tipos</option>
          <option value="lesson">Leitura</option>
          <option value="pdf">Documento (PDF)</option>
          <option value="video">Videoaula</option>
        </Select>
      </div>
      {catalog.loading ? (
        <Skeleton />
      ) : catalog.error ? (
        <ErrorState message={catalog.error.message} retry={() => void catalog.retry()} />
      ) : !filtered.length ? (
        <Empty
          title={hasFilters ? 'Nenhum material encontrado' : 'Nenhum material disponível'}
          description={
            hasFilters
              ? 'Tente alterar a busca ou limpar os filtros selecionados.'
              : user?.role === 'admin'
                ? 'Os materiais publicados nas disciplinas aparecerão aqui.'
                : 'Os materiais publicados nas suas disciplinas aparecerão aqui.'
          }
          action={
            hasFilters ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setSubjectId('all');
                  setKind('all');
                }}
              >
                Limpar filtros
              </Button>
            ) : (
              <LinkButton href="/disciplinas">Ver disciplinas</LinkButton>
            )
          }
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            {countLabel(filtered.length, 'material encontrado', 'materiais encontrados')}
          </p>
          <Card className="!p-0 overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const done = completedIds.has(item.id);
                return (
                  <li key={item.id}>
                    <Link
                      href={`/materiais?id=${encodeURIComponent(item.id)}`}
                      className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                        <KindIcon kind={item.kind} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                            {item.title}
                          </h2>
                          <Badge tone="purple">{kindLabel[item.kind]}</Badge>
                          {done && (
                            <Badge tone="green">
                              <CheckCircle2 aria-hidden="true" className="size-3" />
                              Concluído
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                          <span>{item.subjectName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 aria-hidden="true" className="size-3" />
                            {item.duration} min
                          </span>
                        </p>
                      </div>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
