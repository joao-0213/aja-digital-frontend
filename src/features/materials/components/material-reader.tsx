'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen, CheckCircle2, Download, Clock3, Pencil } from 'lucide-react';
import { ResponsiveDisclosure } from '@/components/ui/responsive-disclosure';
import { PublicationDate } from '@/components/ui/publication-date';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Empty, LinkButton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { readMaterialFile } from '@/lib/material-files';
import { canManageSubject } from '@/lib/access';
import { MaterialVideo } from './material-video';
import { MaterialComposer } from './material-composer';

export function MaterialReader() {
  const {
    db,
    user,
    mutate,
    busy
  } = useApp();
  const id = useSearchParams().get('id') ?? 'mat2';
  const material = db.materials.find(m => m.id === id);
  const mod = db.modules.find(m => m.id === material?.moduleId);
  const subject = db.subjects.find(s => s.id === mod?.subjectId);
  const [editing, setEditing] = useState(false);
  const [localFile, setLocalFile] = useState<{ id: string; url?: string; error?: string } | null>(null);
  useEffect(() => {
    const fileId = material?.localFileId;
    if (!fileId) return;
    let cancelled = false;
    let url: string | undefined;
    readMaterialFile(fileId).then(file => {
      if (cancelled) return;
      if (!file) { setLocalFile({ id: fileId, error: 'Este PDF não está disponível neste navegador. Peça ao professor para publicá-lo novamente.' }); return; }
      url = URL.createObjectURL(file);
      setLocalFile({ id: fileId, url });
    }).catch(() => { if (!cancelled) setLocalFile({ id: fileId, error: 'Não foi possível abrir o PDF. Recarregue a página para tentar novamente.' }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [material?.localFileId]);
  useEffect(() => {
    if (material) void mutate(d => {
      const existing = d.progress.find(p => p.userId === user.id && p.materialId === id);
      if (existing) existing.lastAccess = new Date().toISOString();else d.progress.push({
        userId: user.id,
        materialId: id,
        lastAccess: new Date().toISOString(),
        completed: false
      });
    });
  }, [id, user.id, mutate]);
  if (!material || !mod || !subject) return <Empty title="Material indisponível" description="O material pode ter sido retirado ou seu acesso à disciplina foi encerrado. Consulte as disciplinas disponíveis." action={<LinkButton href="/disciplinas">Voltar às disciplinas</LinkButton>} />;
  const modules = db.modules.filter(m => m.subjectId === subject.id).sort((a, b) => a.order - b.order);
  const materials = modules.flatMap(m => db.materials.filter(a => a.moduleId === m.id).sort((a, b) => a.order - b.order));
  const done = db.progress.some(p => p.userId === user.id && p.materialId === id && p.completed);
  const download = () => {
    const blob = new Blob([material.title + '\n\n' + material.content], {
      type: 'text/plain;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aja-resumo.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <Link href={`/disciplinas/detalhes?id=${subject.id}&aba=materiais#module-${mod.id}`} className="mb-6 inline-block text-sm font-medium text-brand-600">{subject.name} / {mod.title}</Link>
    {canManageSubject(db, user, subject.id) && <div className="mb-5 flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={() => setEditing(true)}><Pencil aria-hidden="true" className="size-4" />Editar material</Button><p className="text-xs text-slate-500">Publicado por {db.users.find(u => u.id === material.authorId)?.name ?? 'Equipe AJA'}{material.updatedAt && ` · Última alteração: ${db.users.find(u => u.id === material.updatedBy)?.name ?? 'Equipe AJA'}, ${new Date(material.updatedAt).toLocaleString('pt-BR')}`}</p></div>}
    {editing && <MaterialComposer key={material.id} materialId={material.id} moduleId={mod.id} onClose={() => setEditing(false)} />}
    <div className="grid items-start gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-slate-200 bg-white p-5 xl:sticky xl:top-6">
        <ResponsiveDisclosure title="Materiais da disciplina">
        <nav aria-label="Conteúdo da disciplina" className="mt-6 space-y-6">
          {modules.map(m => <div key={m.id}>
            <h3 className="mb-2 text-xs font-semibold leading-5 text-slate-500">{m.order}. {m.title}</h3>
            {materials.filter(mat => mat.moduleId === m.id).map(mat => <Link href={`/materiais?id=${mat.id}`} key={mat.id} aria-current={mat.id === id ? 'page' : undefined} className={cn('flex items-start gap-2 rounded-lg p-2.5 text-sm leading-5', mat.id === id ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-500 hover:bg-slate-50')}>
              <BookOpen className="mt-0.5 size-3.5 shrink-0" />
              {mat.title}
            </Link>)}
          </div>)}
        </nav>
        </ResponsiveDisclosure>
      </aside>
      <div>
        <Card className="!p-0 overflow-hidden">
          {material.kind === 'video' && <MaterialVideo key={`${material.id}:${material.videoUrl}`} url={material.videoUrl} title={material.title} />}
          <div className="p-6 sm:p-8">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Badge tone="purple">
                {material.kind === 'pdf' ? 'Documento' : material.kind === 'video' ? 'Videoaula' : 'Leitura'}
              </Badge>
              <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Clock3 className="size-3.5" />{material.duration} min</span>
              {done && <Badge tone="green">Concluído</Badge>}
            </div>
            <h1 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {material.title}
            </h1>
            <p className="mb-5 text-xs text-slate-500"><PublicationDate value={material.createdAt} /></p>
            {material.localFileId && <div className="mb-6">
              {localFile?.id === material.localFileId && localFile.url ? <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-50 p-4"><span className="min-w-0 break-all text-sm text-brand-900">{material.fileName}{material.fileSize ? ` · ${(material.fileSize / 1024).toFixed(0)} KB` : ''}</span><a href={localFile.url} download={material.fileName} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"><Download aria-hidden="true" className="size-4" />Baixar PDF</a></div>
                <iframe title={`PDF: ${material.title}`} src={localFile.url} className="hidden h-[560px] w-full rounded-lg border border-slate-200 sm:block" />
                <p className="mt-3 text-xs leading-5 text-slate-500">Arquivo salvo nesta demonstração, apenas neste navegador. Se a prévia não abrir, use Baixar PDF.</p>
              </> : localFile?.id === material.localFileId && localFile.error ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{localFile.error}</p> : <p role="status" className="p-4 text-sm text-slate-500">Abrindo PDF…</p>}
            </div>}
            {material.kind === 'pdf' && !material.localFileId && <p className="mb-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              Prévia textual do documento de exemplo. O arquivo original não foi enviado.
            </p>}
            <article className="space-y-5 leading-8 text-slate-600">
              {material.content.split('\n\n').map((p, i) => <p key={i} className="whitespace-pre-line">
                {p}
              </p>)}
            </article>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-6">
              <Button variant="secondary" onClick={download}><Download className="size-4" />Baixar resumo (.txt)</Button>
              <Button loading={busy} disabled={done} onClick={() => void mutate(d => {
                const entry = d.progress.find(p => p.userId === user.id && p.materialId === id);
                if (entry) entry.completed = true;else d.progress.push({
                  userId: user.id,
                  materialId: id,
                  completed: true,
                  lastAccess: new Date().toISOString()
                });
              }, 'Material marcado como concluído.')}>
                <CheckCircle2 className="size-4" />
                {done ? 'Material concluído' : 'Marcar como concluído'}
              </Button>
            </div>
          </div>
        </Card>
        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <LinkButton secondary href={`/forum?disciplina=${subject.id}`}>Fiquei com uma dúvida</LinkButton>
          <LinkButton href={`/disciplinas/detalhes?id=${subject.id}&aba=materiais#module-${mod.id}`}>Voltar à disciplina</LinkButton>
        </div>
      </div>
    </div>
  </>;
}
