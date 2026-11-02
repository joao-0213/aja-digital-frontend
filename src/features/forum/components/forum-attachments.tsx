'use client';

import { useEffect, useState } from 'react';
import type { WorkAttachment } from '@/models';
import { Button, Dialog } from '@/components/ui';
import { readMaterialFile } from '@/lib/material-files';

export function ForumAttachments({ items, files, onRemove }: { items: WorkAttachment[]; files?: Record<string, File>; onRemove?: (id: string) => void }) {
  const [preview, setPreview] = useState<{ url: string; name: string; image: boolean }>();
  const [error, setError] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const open = async (item: Extract<WorkAttachment, { kind: 'file' }>, download: boolean) => {
    setError('');
    try {
      const file = files?.[item.id] ?? await readMaterialFile(item.id);
      if (!file) throw new Error('Arquivo local indisponível neste navegador. A conversa permanece preservada.');
      if (download) {
        const url = URL.createObjectURL(new Blob([file], { type: 'application/octet-stream' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = item.name; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const safe = new Blob([file], { type: item.mime });
        setPreview({ url: URL.createObjectURL(safe), name: item.name, image: item.mime.startsWith('image/') });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível abrir o anexo.'); }
  };
  return <>
    <ul className="divide-y divide-slate-200">{items.map(item => <li key={item.id} className="space-y-2 py-4 text-sm">
      <p className="break-words font-semibold">{item.name}</p>
      {item.kind === 'link' ? <><a className="inline-flex min-h-11 max-w-full items-center break-all text-brand-700 underline" href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a><p className="text-xs leading-5 text-slate-500">Compartilhe o acesso com a turma. O documento externo pode mudar depois do envio; suas permissões não são verificadas pelo AJA.</p></> : <><p className="text-xs text-slate-500">{item.size < 1024 ? item.size + ' bytes' : item.size < 1024 * 1024 ? (item.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' KB' : (item.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' MB'}</p><div className="flex flex-wrap gap-2">{/^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(item.mime) ? <Button variant="secondary" onClick={() => void open(item, false)}>Prévia de {item.name}</Button> : <span className="self-center text-xs text-slate-500">Formato aceito; consulta por download.</span>}<Button variant="secondary" onClick={() => void open(item, true)}>Baixar {item.name}</Button></div></>}
      {onRemove && <Button variant="ghost" onClick={() => onRemove(item.id)}>Remover {item.name}</Button>}
    </li>)}</ul>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    <Dialog open={!!preview} onClose={() => setPreview(undefined)} title={preview?.name ?? 'Prévia'}>{preview && (preview.image ? <img src={preview.url} alt={preview.name} className="max-h-[60vh] max-w-full" /> : <iframe title={preview.name} src={preview.url} sandbox="" className="h-[60vh] w-full" />)}<p className="mt-4 text-sm text-slate-500">Se a prévia não abrir, feche e use Baixar.</p></Dialog>
  </>;
}
