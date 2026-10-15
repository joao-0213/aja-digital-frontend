'use client';

import { useState, type ChangeEvent } from 'react';
import { Camera, FileText, Upload, Trash2 } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Dialog, Input, PageHeading, Select, Textarea } from '@/components/ui';
import { dateLabel, roleLabels, uid } from '@/lib/utils';
import { validateUpload } from '@/lib/domain';
import { type User } from '@/models';
import { quotaLabels } from '@/lib/user-labels';

export function ProfilePage() {
  const {
    db,
    user,
    role,
    mutate,
    busy,
    notify
  } = useApp();
  const [name, setName] = useState(user.name);
  const [course, setCourse] = useState(user.course);
  const [institution, setInstitution] = useState(user.institution);
  const [quota, setQuota] = useState(user.quota);
  const [bio, setBio] = useState(user.bio);
  const [remove, setRemove] = useState<string | null>(null);
  const docs = db.documents.filter(d => d.userId === user.id);
  const uploadAvatar = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateUpload(file, ['image/png', 'image/jpeg'], 2 * 1024 * 1024)) {
      notify('Escolha uma imagem PNG ou JPG de até 2 MB.', true);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = reader.result;
      if (typeof image === 'string') void mutate(d => {
        d.users.find(u => u.id === user.id)!.avatar = image;
      }, 'Foto atualizada apenas neste navegador.');
    };
    reader.onerror = () => notify('Não foi possível ler a imagem.', true);
    reader.readAsDataURL(file);
  };
  const uploadDocument = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateUpload(file, ['application/pdf', 'image/png', 'image/jpeg'], 5 * 1024 * 1024)) {
      notify('Escolha PDF, JPG ou PNG de até 5 MB.', true);
      e.target.value = '';
      return;
    }
    await mutate(d => {
      d.documents.push({
        id: uid('document'),
        userId: user.id,
        name: file.name,
        size: file.size,
        status: 'pending',
        uploadedAt: new Date().toISOString()
      });
    }, 'Documento simulado enviado para análise. Apenas o nome foi salvo.');
    e.target.value = '';
  };
  return <>
    <PageHeading title="Meu perfil" description="Consulte e atualize seus dados cadastrais." />
    <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="text-center">
        <div className="mb-4 flex justify-center">
          <Avatar name={user.name} src={user.avatar} size="lg" />
        </div>
        <h2 className="text-lg font-semibold">
          {user.name}
        </h2>
        <p className="mt-1 break-all text-sm text-slate-400">
          {user.email}
        </p>
        <div className="my-4">
          <Badge tone="purple">
            {roleLabels[role]}
          </Badge>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 focus-within:outline-2 focus-within:outline-brand-600"><Camera className="size-4" />Alterar foto<input type="file" className="sr-only" accept="image/png,image/jpeg" onChange={uploadAvatar} /></label>
        <p className="mt-3 text-xs leading-5 text-slate-400">JPG ou PNG · até 2 MB<br />A foto é salva somente neste navegador.</p>
        {user.avatar && <Button variant="ghost" onClick={() => void mutate(d => {
          delete d.users.find(u => u.id === user.id)!.avatar;
        }, 'Foto removida.')}>Remover foto</Button>}
        <div className="mt-6 border-t border-slate-100 pt-5 text-left">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Minhas turmas</p>
          {db.classes.filter(c => c.studentIds.includes(user.id)).map(c => <p key={c.id} className="py-1 text-sm text-slate-600">
            {c.name}
          </p>)}
        </div>
      </Card>
      <div className="space-y-6">
        <Card>
          <h2 className="mb-6 text-lg font-semibold">Informações e objetivos</h2>
          <form className="space-y-5" onSubmit={async e => {
            e.preventDefault();
            await mutate(d => {
              Object.assign(d.users.find(u => u.id === user.id)!, {
                name: name.trim(),
                course: course.trim(),
                institution: institution.trim(),
                quota,
                bio: bio.trim()
              });
            }, 'Perfil atualizado.');
          }}>
            <Input label="Nome completo" value={name} onChange={e => setName(e.target.value)} required minLength={3} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Curso pretendido" value={course} onChange={e => setCourse(e.target.value)} placeholder="Ex.: Ciência da Computação" />
              <Input label="Instituição alvo" value={institution} onChange={e => setInstitution(e.target.value)} placeholder="Ex.: UFPR" />
            </div>
            <Select label="Modalidade de ingresso" value={quota} onChange={e => setQuota(e.target.value as User['quota'])}>
              {Object.entries(quotaLabels).map(([id, label]) => <option key={id} value={id}>
                {label}
              </option>)}
            </Select>
            <Textarea label="Sobre mim" value={bio} onChange={e => setBio(e.target.value)} maxLength={500} />
            <div className="flex justify-end">
              <Button loading={busy} type="submit">Salvar alterações</Button>
            </div>
          </form>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Documentos e adaptações</h2>
          <p className="mb-5 mt-2 text-sm leading-6 text-slate-500">Envie apenas arquivos fictícios para testar o fluxo. O conteúdo dos documentos não é lido, armazenado ou enviado.</p>
          <div className="space-y-3">
            {docs.map(d => <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4">
              <FileText className="size-5 shrink-0 text-brand-500" />
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium">
                  {d.name}
                </p>
                <p className="mt-1 text-xs text-slate-400">{Math.ceil(d.size / 1024)} KB · {dateLabel(d.uploadedAt)}</p>
                {d.reason && <p className="mt-1 text-xs text-rose-600">
                  {d.reason}
                </p>}
              </div>
              <Badge tone={d.status === 'approved' ? 'green' : d.status === 'pending' ? 'amber' : 'red'}>
                {d.status === 'approved' ? 'Aprovado' : d.status === 'pending' ? 'Em análise' : 'Rejeitado'}
              </Badge>
              <Button variant="ghost" aria-label={`Remover ${d.name}`} onClick={() => setRemove(d.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>)}
          </div>
          <label className="mt-5 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/30 p-7 text-center focus-within:outline-2 focus-within:outline-brand-600">
            <Upload className="mb-3 size-6 text-brand-500" />
            <span className="text-sm font-semibold text-brand-600">Selecionar documento de exemplo</span>
            <span className="mt-1 text-xs text-slate-400">PDF, JPG ou PNG · até 5 MB</span>
            <input className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => void uploadDocument(e)} disabled={busy} />
          </label>
        </Card>
      </div>
    </div>
    <Dialog open={!!remove} onClose={() => setRemove(null)} title="Remover documento?">
      <p className="mb-6 text-sm leading-6 text-slate-500">A referência ao documento será removida desta demonstração. Nenhum arquivo real será apagado.</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => setRemove(null)}>Cancelar</Button>
        <Button variant="danger" loading={busy} onClick={async () => {
          if (await mutate(d => {
            d.documents = d.documents.filter(doc => doc.id !== remove);
          }, 'Documento removido.')) setRemove(null);
        }}>Remover</Button>
      </div>
    </Dialog>
  </>;
}
