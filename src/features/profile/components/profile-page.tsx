'use client';

import { useState } from 'react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Input, PageHeading } from '@/components/ui';
import { roleLabels } from '@/lib/utils';
import { useRecordRevision } from '@/hooks/use-record-revision';
import { RecordConflict } from '@/components/shared/record-conflict';
import { PrivacyNotice } from '@/features/privacy';
import { EnrollmentStatus } from '@/features/students';

export function ProfilePage() {
  const { db, user, role, mutate, busy } = useApp();
  const [name, setName] = useState(user.name);
  const revision = useRecordRevision('users', user);
  return <>
    <PageHeading title="Meu perfil" description="Consulte e atualize seus dados cadastrais." />
    <EnrollmentStatus />
    <div className="mb-4"><PrivacyNotice /></div>
    <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="text-center">
        <div className="mb-4 flex justify-center"><Avatar name={user.name} size="lg" /></div>
        <h2 className="text-lg font-semibold">{user.name}</h2>
        <p className="mt-1 break-all text-sm text-slate-500">{user.email}</p>
        <div className="my-4"><Badge tone="purple">{roleLabels[role]}</Badge></div>
        <div className="mt-6 border-t border-slate-100 pt-5 text-left">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Minhas turmas</h3>
          {db.classes.filter(c => c.studentIds.includes(user.id)).map(c => <p key={c.id} className="py-1 text-sm text-slate-600">{c.name}</p>)}
          {!db.classes.some(c => c.studentIds.includes(user.id)) && <p className="text-sm text-slate-500">Nenhuma matrícula nesta demonstração.</p>}
        </div>
      </Card>
      <Card>
        <h2 className="mb-6 text-lg font-semibold">Dados cadastrais</h2>
        {revision.conflict && <RecordConflict key={user.revision} author={db.users.find(u => u.id === user.updatedBy)?.name ?? 'Equipe AJA'} updatedAt={user.updatedAt} onReviewed={revision.acknowledge}><p>Nome atual: {user.name}. E-mail: {user.email}. Seu nome em edição foi preservado.</p></RecordConflict>}
        <form className="space-y-5" onSubmit={async e => {
          e.preventDefault();
          if (await mutate(d => { d.users.find(u => u.id === user.id)!.name = name.trim(); }, 'Perfil atualizado.', revision.expected)) revision.capture({ ...user, revision: (user.revision ?? 0) + 1 });
        }}>
          <Input label="Nome completo" value={name} onChange={e => setName(e.target.value)} required minLength={3} maxLength={100} />
          <Input label="E-mail" type="email" value={user.email} readOnly />
          <div className="flex justify-end"><Button loading={busy} disabled={revision.conflict} type="submit">Salvar alterações</Button></div>
        </form>
      </Card>
    </div>
  </>;
}
