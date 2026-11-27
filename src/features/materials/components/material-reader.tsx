'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, BookOpen, CheckCircle2, Download, Clock3, ExternalLink, Pencil } from 'lucide-react';
import { ResponsiveDisclosure } from '@/components/ui/responsive-disclosure';
import { PublicationDate } from '@/components/ui/publication-date';
import { useApp, useSession } from '@/providers/app-context';
import { Badge, Button, Card, Empty, ErrorState, LinkButton, Skeleton } from '@/components/ui';
import { brazilDateTimeLabel, cn } from '@/lib/utils';
import { HttpError } from '@/lib/http-client';
import { useHttpQuery } from '@/hooks/use-http-query';
import { createMaterialsApi } from '../api';
import { MaterialVideo } from './material-video';
import { MaterialComposer } from './material-composer';
import { MaterialLibrary } from './material-library';
import { toErrorMessage } from '@/lib/errors';

function ReaderContent({ id }: { id: string }) {
  const { client, sessionKey, resourceEpoch, user } = useSession();
  const { notify } = useApp();
  const isStudent = user?.role === 'student';
  const api = useMemo(() => createMaterialsApi(client), [client]);
  const query = useHttpQuery({ sessionKey, key: `material:${id}:${resourceEpoch}` }, useCallback(signal => api.read(id, signal), [api, id]), !!id);
  const detail = query.data;
  const subjectId = detail?.subject.id ?? '';
  const fileId = detail?.material.fileId ?? '';
  const navigation = useHttpQuery({ sessionKey, key: `material-navigation:${subjectId}:${resourceEpoch}` }, useCallback(signal => api.all({ subjectId }, signal), [api, subjectId]), !!subjectId);
  const outline = useHttpQuery({ sessionKey, key: `material-outline:${subjectId}:${resourceEpoch}` }, useCallback(signal => api.outline(subjectId, signal), [api, subjectId]), !!subjectId);
  const progress = useHttpQuery({ sessionKey, key: `material-progress:${id}:${resourceEpoch}` }, useCallback(async signal => {
    if (client.getSnapshot().sessionKey !== sessionKey || client.getSnapshot().status !== 'authenticated') throw new HttpError('cancelled', 'A sessão deste material mudou.');
    const result = await api.progress(id, undefined, signal);
    if (client.getSnapshot().sessionKey !== sessionKey) throw new HttpError('cancelled', 'A sessão deste material mudou.');
    return result;
  }, [api, client, id, sessionKey]), !!detail && isStudent);
  const binary = useHttpQuery({ sessionKey, key: `material-file:${fileId}:${resourceEpoch}` }, useCallback(signal => api.files.download(fileId, 'inline', signal), [api, fileId]), !!fileId);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!binary.data) return;
    const pdfBlob = binary.data.type === 'application/pdf' ? binary.data : new Blob([binary.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(pdfBlob);
    setPreview({ blob: binary.data, url });
    return () => URL.revokeObjectURL(url);
  }, [binary.data]);
  const [editing, setEditing] = useState(() => client.readDraft<boolean>(`material-edit-open:${id}`) ?? false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  if (!id) return <MaterialLibrary />;
  if (query.loading) return <Skeleton />;
  if (query.error) return <><ErrorState message={query.error.message} retry={() => void query.retry()} /><LinkButton href="/disciplinas">Voltar às disciplinas</LinkButton></>;
  if (!detail) return <Empty title="Material indisponível" action={<LinkButton href="/disciplinas">Ver disciplinas</LinkButton>} />;
  const { material, module, subject, canManageContent } = detail;
  const materials = navigation.data ?? [];
  const modules = outline.data?.modules ?? [];
  const back = `/disciplinas/detalhes?id=${encodeURIComponent(subject.id)}&aba=materiais#module-${module.id}`;
  const done = progress.data?.completed ?? false;
  const complete = async () => {
    if (completing || done || client.getSnapshot().sessionKey !== sessionKey) return;
    setCompleting(true); setError('');
    try {
      await api.progress(id, true);
      if (client.getSnapshot().sessionKey !== sessionKey) return;
      notify('Material marcado como concluído.');
      await progress.invalidate();
    } catch (cause: unknown) { if (client.getSnapshot().sessionKey === sessionKey) setError(toErrorMessage(cause, 'Não foi possível concluir. Tente novamente.')); }
    finally { setCompleting(false); }
  };
  const downloadText = () => {
    const blob = new Blob([material.title + '\n\n' + material.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'aja-resumo.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const fileUrl = binary.data && preview?.blob === binary.data ? preview.url : undefined;
  const close = () => { client.clearDraft(`material-edit-open:${id}`, sessionKey); setEditing(false); };
  return <>
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <LinkButton secondary href={back}><ArrowLeft aria-hidden="true" className="size-4" />Voltar à disciplina</LinkButton>
      <span className="text-sm text-slate-500 [overflow-wrap:anywhere]">{subject.name} / {module.title}</span>
    </div>
    {canManageContent && <div className="mb-5 flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={() => { client.saveDraft(`material-edit-open:${id}`, true, sessionKey); setEditing(true); }}><Pencil aria-hidden="true" className="size-4" />Editar material</Button><p className="text-xs text-slate-500">Publicado por {material.author.name}{material.updatedAt && ` · Última alteração: ${brazilDateTimeLabel(material.updatedAt)}`}</p></div>}
    {editing && canManageContent && <MaterialComposer materialId={id} moduleId={module.id} onClose={close} onPublished={() => { void query.invalidate(); void navigation.invalidate(); }} />}
    <div className="grid items-start gap-6 xl:grid-cols-[250px_minmax(0,1fr)]"><aside className="rounded-xl border border-slate-200 bg-white p-5 xl:sticky xl:top-6"><ResponsiveDisclosure title="Materiais da disciplina"><nav aria-label="Conteúdo da disciplina" className="mt-6 space-y-6">{navigation.loading || outline.loading ? <Skeleton /> : navigation.error || outline.error ? <ErrorState message={navigation.error?.message ?? outline.error!.message} retry={() => { void navigation.retry(); void outline.retry(); }} /> : modules.map((mod, index) => <div key={mod.id}><h3 className="mb-2 text-xs font-semibold leading-5 text-slate-500 [overflow-wrap:anywhere]">{index + 1}. {mod.title}</h3>{materials.filter(item => item.moduleId === mod.id).map(item => <Link href={`/materiais?id=${encodeURIComponent(item.id)}`} key={item.id} aria-current={item.id === id ? 'page' : undefined} className={cn('flex items-start gap-2 rounded-lg p-2.5 text-sm leading-5 [overflow-wrap:anywhere]', item.id === id ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-500 hover:bg-slate-50')}><BookOpen aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0">{item.title}</span></Link>)}</div>)}</nav></ResponsiveDisclosure></aside>
      <div className="min-w-0"><Card className="!p-0 overflow-hidden">{material.kind === 'video' && <MaterialVideo key={`${material.id}:${material.videoUrl}`} url={material.videoUrl ?? undefined} title={material.title} />}<div className="p-6 sm:p-8"><div className="mb-4 flex flex-wrap items-center gap-3"><Badge tone="purple">{material.kind === 'pdf' ? 'Documento' : material.kind === 'video' ? 'Videoaula' : 'Leitura'}</Badge><span className="inline-flex items-center gap-1 text-xs text-slate-500"><Clock3 aria-hidden="true" className="size-3.5" />{material.duration} min</span>{done && <Badge tone="green">Concluído</Badge>}</div><h1 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">{material.title}</h1><p className="mb-5 text-xs text-slate-500"><PublicationDate value={material.createdAt} /></p>
        {material.kind === 'pdf' && <div className="mb-6">{!fileId ? <p className="rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-900">Arquivo indisponível.</p> : binary.loading ? <p role="status" className="p-4 text-sm text-slate-500">Abrindo PDF…</p> : binary.error ? <ErrorState message={binary.error.message} retry={() => void binary.retry()} /> : fileUrl ? <><div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-50 p-4"><span className="min-w-0 break-all text-sm text-brand-900">{material.file?.name ?? 'Documento PDF'}{material.file && ` · ${(material.file.size / 1024).toFixed(0)} KB`}</span><div className="flex flex-wrap items-center gap-2"><a href={fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-100/50"><ExternalLink aria-hidden="true" className="size-4" />Abrir PDF</a><a href={fileUrl} download={material.file?.name ?? 'material.pdf'} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"><Download aria-hidden="true" className="size-4" />Baixar PDF</a></div></div><object data={fileUrl} type="application/pdf" aria-label={`PDF: ${material.title}`} className="hidden h-[560px] w-full rounded-lg border border-slate-200 bg-slate-50 sm:block"><div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-600"><p>Prévia indisponível neste navegador.</p><a href={fileUrl} download={material.file?.name ?? 'material.pdf'} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"><Download aria-hidden="true" className="size-4" />Baixar PDF</a></div></object></> : <p role="status" className="text-sm text-slate-500">Preparando a prévia…</p>}</div>}
        <article className="space-y-5 leading-8 text-slate-600 [overflow-wrap:anywhere]">{material.content.split('\n\n').map((paragraph, index) => <p key={index} className="whitespace-pre-line">{paragraph}</p>)}</article>
        {progress.error && <div className="mt-5"><ErrorState message={progress.error.message} retry={() => void progress.retry()} /></div>}{error && <p role="alert" className="mt-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {(material.kind === 'lesson' || isStudent) && <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-6">{material.kind === 'lesson' ? <Button variant="secondary" onClick={downloadText}><Download aria-hidden="true" className="size-4" />Baixar como .txt</Button> : <span />}{isStudent && <Button loading={completing} disabled={done || progress.loading} onClick={() => void complete()}><CheckCircle2 aria-hidden="true" className="size-4" />{done ? 'Material concluído' : 'Marcar como concluído'}</Button>}</div>}
      </div></Card><div className="mt-5 flex flex-wrap justify-between gap-3"><LinkButton secondary href={`/forum?disciplina=${encodeURIComponent(subject.id)}&material=${encodeURIComponent(material.id)}`}>{isStudent ? 'Fiquei com uma dúvida' : 'Abrir fórum da disciplina'}</LinkButton><LinkButton secondary href={back}>Voltar à disciplina</LinkButton></div></div>
    </div>
  </>;
}

export function MaterialReader() {
  const id = useSearchParams().get('id') ?? '';
  return <ReaderContent key={id} id={id} />;
}
