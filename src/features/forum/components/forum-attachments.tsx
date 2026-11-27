'use client';

import { useEffect, useState } from 'react';
import { Button, Dialog } from '@/components/ui';
import type { ForumAttachmentDto } from '../api';
import { toErrorMessage } from '@/lib/errors';

const safePreview = /^(application\/pdf|image\/(png|jpeg|webp))$/;

export function ForumAttachments({ item, readContent, onRemove }: { item: ForumAttachmentDto; readContent: (id: string, inline: boolean) => Promise<Blob>; onRemove?: () => void }) {
  const [preview, setPreview] = useState<{ url: string; image: boolean }>();
  const [error, setError] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const open = async (inline: boolean) => {
    setError('');
    try {
      const blob = await readContent(item.id, inline && safePreview.test(item.mime));
      const url = URL.createObjectURL(new Blob([blob], { type: inline ? item.mime : 'application/octet-stream' }));
      if (inline && safePreview.test(item.mime)) setPreview({ url, image: item.mime.startsWith('image/') });
      else { const anchor = document.createElement('a'); anchor.href = url; anchor.download = item.name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (cause) { setError(toErrorMessage(cause, 'Não foi possível abrir o anexo.')); }
  };
  return <>
    <div className="mt-4 rounded-lg border border-slate-200 p-4 text-sm">
      <p className="break-words font-semibold">{item.name}</p>
      <p className="mt-1 text-xs text-slate-500">{(item.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {safePreview.test(item.mime) && <Button variant="secondary" aria-label={`Prévia de ${item.name}`} onClick={() => void open(true)}>Prévia</Button>}
        <Button variant="secondary" aria-label={`Baixar ${item.name}`} onClick={() => void open(false)}>Baixar</Button>
        {onRemove && <Button variant="secondary" onClick={onRemove}>Remover anexo</Button>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    </div>
    <Dialog open={!!preview} onClose={() => setPreview(undefined)} title={item.name}>
      {preview && (preview.image ? <img src={preview.url} alt={item.name} className="max-h-[60vh] max-w-full" /> : <iframe title={item.name} src={preview.url} sandbox="" className="h-[60vh] w-full" />)}
    </Dialog>
  </>;
}
