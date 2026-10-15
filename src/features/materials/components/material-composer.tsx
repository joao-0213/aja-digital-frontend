'use client';

import { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Button, Dialog, Input, Select, Textarea } from '@/components/ui';
import { saveMaterialFiles, removeMaterialFiles } from '@/lib/material-files';
import { uid } from '@/lib/utils';
import { type MaterialKind } from '@/models';

export function MaterialComposer({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const { db, user, role, mutate } = useApp();
  const module = db.modules.find(m => m.id === moduleId);
  const subject = db.subjects.find(s => s.id === module?.subjectId);
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<MaterialKind>('pdf');
  const [files, setFiles] = useState<{ id: string; file: File; title: string }[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [duration, setDuration] = useState(10);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  if (!module || !subject || !(role === 'admin' || role === 'teacher' && subject.teacherId === user.id)) return null;

  const addFiles = (incoming: File[]) => {
    setError('');
    if (files.length + incoming.length > 10) { setError('Envie até 10 PDFs por vez.'); return; }
    if (incoming.some(file => !file.name.toLowerCase().endsWith('.pdf') || file.type && file.type !== 'application/pdf' || !file.size || file.size > 10 * 1024 * 1024)) {
      setError('Selecione PDFs válidos, não vazios, de até 10 MB cada.'); return;
    }
    setFiles(current => [...current, ...incoming.filter(file => !current.some(item => item.file.name === file.name && item.file.size === file.size)).map(file => ({ id: uid('file'), file, title: file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ') }))]);
  };
  const publish = async () => {
    setError('');
    if (kind === 'pdf' && !files.length) { setError('Selecione ao menos um PDF.'); return; }
    if (kind === 'pdf' ? files.some(item => !item.title.trim()) : !title.trim() || !content.trim()) { setError('Preencha os títulos e o conteúdo obrigatório.'); return; }
    setSaving(true);
    let savedIds: string[] = [];
    try {
      if (kind === 'pdf') {
        for (const item of files) {
          const signature = new TextDecoder().decode(await item.file.slice(0, 5).arrayBuffer());
          if (signature !== '%PDF-') throw new Error(`${item.file.name} não é um PDF válido.`);
        }
        await saveMaterialFiles(files);
        savedIds = files.map(item => item.id);
      }
      const ok = await mutate(d => {
        const order = Math.max(0, ...d.materials.filter(m => m.moduleId === moduleId).map(m => m.order));
        if (kind === 'pdf') files.forEach((item, index) => d.materials.push({ id: uid('material'), moduleId, authorId: user.id, createdAt: new Date().toISOString(), title: item.title.trim(), kind, duration, content: content.trim(), localFileId: item.id, fileName: item.file.name, fileSize: item.file.size, order: order + index + 1 }));
        else d.materials.push({ id: uid('material'), moduleId, authorId: user.id, createdAt: new Date().toISOString(), title: title.trim(), kind, duration, content: content.trim(), order: order + 1 });
      }, kind === 'pdf' ? `${files.length} ${files.length === 1 ? 'material publicado' : 'materiais publicados'} em ${module.title}.` : 'Material publicado no módulo.');
      if (ok) { savedIds = []; onClose(); }
      else setError('O envio falhou. Seus arquivos continuam selecionados; tente publicar novamente.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o material.'); }
    finally {
      if (savedIds.length) await removeMaterialFiles(savedIds).catch(() => {});
      setSaving(false);
    }
  };

  return <Dialog open onClose={() => { if (!saving) onClose(); }} title="Publicar materiais">
    <p className="mb-5 rounded-lg bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-900"><span className="block text-xs text-brand-700">Destino</span><strong>{subject.name}</strong> / {module.title}</p>
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); void publish(); }}>
      <fieldset disabled={saving} className="space-y-5">
        <Select label="O que deseja publicar?" value={kind} onChange={event => { setKind(event.target.value as MaterialKind); setError(''); }}>
          <option value="pdf">Arquivos PDF</option><option value="lesson">Texto de apoio</option><option value="video">Transcrição de vídeo (demonstração)</option>
        </Select>
        {kind === 'pdf' ? <>
          <div onDragOver={event => { event.preventDefault(); if (!saving) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!saving) addFiles(Array.from(event.dataTransfer.files)); }} className={`rounded-xl border-2 border-dashed p-5 text-center ${dragging ? 'border-brand-600 bg-brand-100' : 'border-brand-200 bg-brand-50/40'}`}>
            <Upload aria-hidden="true" className="mx-auto mb-3 size-6 text-brand-600" />
            <p className="text-sm font-medium">Arraste os PDFs para cá</p><p className="mb-3 mt-1 text-xs text-slate-500">Até 10 arquivos · 10 MB por arquivo</p>
            <Button variant="secondary" onClick={() => input.current?.click()}>Selecionar arquivos</Button>
            <input ref={input} aria-label="Selecionar PDFs" type="file" accept="application/pdf,.pdf" multiple className="sr-only" tabIndex={-1} onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
          </div>
          <div className="space-y-3" aria-live="polite">
            {files.map((item, index) => <div key={item.id} className="flex items-end gap-2">
              <FileText aria-hidden="true" className="mb-3 size-5 shrink-0 text-brand-600" /><div className="min-w-0 flex-1"><Input label={`Título do arquivo ${index + 1}`} value={item.title} required maxLength={160} onChange={event => setFiles(current => current.map(f => f.id === item.id ? { ...f, title: event.target.value } : f))} /><p className="mt-1 truncate text-xs text-slate-500">{item.file.name} · {(item.file.size / 1024).toFixed(0)} KB</p></div><Button variant="ghost" aria-label={`Remover ${item.file.name}`} onClick={() => setFiles(current => current.filter(f => f.id !== item.id))}><X className="size-4" /></Button>
            </div>)}
          </div>
        </> : <Input label="Título do material" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} />}
        <Textarea rows={kind === 'pdf' ? 2 : 4} label={kind === 'pdf' ? 'Orientações para a turma (opcional)' : kind === 'video' ? 'Transcrição do vídeo' : 'Texto de apoio'} value={content} onChange={event => setContent(event.target.value)} required={kind !== 'pdf'} />
        <details className="text-sm text-slate-600"><summary className="py-2 font-medium">Mais opções</summary><div className="mt-2"><Input label="Tempo estimado de estudo (minutos)" type="number" min={1} max={600} value={duration} onChange={event => setDuration(Number(event.target.value))} required /></div></details>
      </fieldset>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <p className="text-xs leading-5 text-slate-500">Demonstração local: os PDFs ficam neste navegador. Não são enviados para outros dispositivos. Use arquivos de exemplo.</p>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" loading={saving}>{kind === 'pdf' && files.length > 1 ? `Publicar ${files.length} materiais` : 'Publicar material'}</Button></div>
    </form>
  </Dialog>;
}
