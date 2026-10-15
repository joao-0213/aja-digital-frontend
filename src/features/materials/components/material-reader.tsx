'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen, CheckCircle2, Download, Pause, Play, Clock3 } from 'lucide-react';
import { ResponsiveDisclosure } from '@/components/ui/responsive-disclosure';
import { PublicationDate } from '@/components/ui/publication-date';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Empty, LinkButton, ProgressBar } from '@/components/ui';
import { cn, percent } from '@/lib/utils';
import { readMaterialFile } from '@/lib/material-files';

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
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
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
    setPlaying(false);
    setPosition(0);
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
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setPosition(p => {
      if (p >= 100) {
        setPlaying(false);
        return 100;
      }
      return p + 1;
    }), 1000);
    return () => clearInterval(timer);
  }, [playing]);
  if (!material || !mod || !subject) return <Empty title="Material não encontrado" action={<LinkButton href="/disciplinas">Voltar às disciplinas</LinkButton>} />;
  const modules = db.modules.filter(m => m.subjectId === subject.id).sort((a, b) => a.order - b.order);
  const materials = modules.flatMap(m => db.materials.filter(a => a.moduleId === m.id).sort((a, b) => a.order - b.order));
  const index = materials.findIndex(m => m.id === id);
  const next = materials[index + 1];
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
    <Link href={`/disciplinas/detalhes?id=${subject.id}`} className="mb-6 inline-block text-sm font-medium text-brand-600">{subject.name} / {mod.title}</Link>
    <div className="grid items-start gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-slate-200 bg-white p-5 xl:sticky xl:top-6">
        <ResponsiveDisclosure title="Materiais da disciplina">
        <ProgressBar label="Materiais concluídos" value={percent(materials.filter(m => db.progress.some(p => p.materialId === m.id && p.userId === user.id && p.completed)).length, materials.length)} />
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
          {material.kind === 'video' && <div className="bg-slate-900 px-6 py-10 text-center text-white sm:px-10">
            <Badge tone="purple">Player demonstrativo</Badge>
            <h2 className="mx-auto mb-5 mt-6 max-w-lg text-2xl font-semibold">
              {material.title}
            </h2>
            <Button aria-label={playing ? 'Pausar simulação' : 'Reproduzir simulação'} onClick={() => setPlaying(!playing)} className="mx-auto !size-16 rounded-full !p-0">
              {playing ? <Pause className="size-6" /> : <Play className="size-6" />}
            </Button>
            <p className="mb-6 mt-4 text-xs text-slate-300">Simulação visual · consulte a transcrição abaixo</p>
            <input type="range" aria-label="Posição do player demonstrativo" min={0} max={100} value={position} onChange={e => setPosition(Number(e.target.value))} className="w-full accent-brand-500" />
          </div>}
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
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-50 p-4"><span className="min-w-0 break-all text-sm text-brand-900">{material.fileName}</span><a href={localFile.url} download={material.fileName} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"><Download aria-hidden="true" className="size-4" />Baixar PDF</a></div>
                <iframe title={`PDF: ${material.title}`} src={localFile.url} className="hidden h-[560px] w-full rounded-lg border border-slate-200 sm:block" />
                <p className="mt-3 text-xs leading-5 text-slate-500">Arquivo salvo nesta demonstração, apenas neste navegador. Se a prévia não abrir, use Baixar PDF.</p>
              </> : localFile?.id === material.localFileId && localFile.error ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{localFile.error}</p> : <p role="status" className="p-4 text-sm text-slate-500">Abrindo PDF…</p>}
            </div>}
            {material.kind !== 'lesson' && !material.localFileId && <p className="mb-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              {material.kind === 'video' ? 'Transcrição de exemplo. Nenhum vídeo externo é carregado.' : 'Prévia textual do documento de exemplo. O arquivo original não foi enviado.'}
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
          {next ? <LinkButton href={`/materiais?id=${next.id}`}>Próximo material</LinkButton> : <LinkButton href="/questionarios">Praticar com questionários</LinkButton>}
        </div>
      </div>
    </div>
  </>;
}
