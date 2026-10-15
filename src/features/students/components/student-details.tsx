'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FileText } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Dialog, Empty, PageHeading, Textarea } from '@/components/ui';
import { quotaLabels } from '@/lib/user-labels';

export function StudentDetails() {
  const {
    db,
    role,
    mutate,
    busy
  } = useApp();
  const id = useSearchParams().get('id') ?? 'u1';
  const student = db.users.find(u => u.id === id);
  const [reject, setReject] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  if (role === 'student') return <Empty title="Acesso reservado à equipe pedagógica" />;
  if (!student) return <Empty title="Aluno não encontrado" />;
  const docs = db.documents.filter(d => d.userId === id);
  return <>
    <Link href="/alunos" className="mb-5 inline-block text-sm font-semibold text-brand-600">Alunos / Perfil</Link>
    <PageHeading title={student.name} description="Informações acadêmicas do aluno." />
    <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
      <Card>
        <Avatar name={student.name} src={student.avatar} size="lg" />
        <h2 className="mt-5 text-lg font-semibold">
          {student.name}
        </h2>
        <p className="mt-2 break-all text-sm text-slate-500">
          {student.email}
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-500">
          {student.bio}
        </p>
      </Card>
      <div className="space-y-5">
        <Card>
          <h2 className="mb-5 font-semibold">Objetivos e informações</h2>
          <dl className="grid gap-5 sm:grid-cols-2">
            {[['Curso pretendido', student.course], ['Instituição alvo', student.institution], ['Modalidade de ingresso', quotaLabels[student.quota]], ['Turmas', db.classes.filter(c => c.studentIds.includes(id)).map(c => c.name).join(', ')]].map(([label, value]) => <div key={label}>
              <dt className="text-xs text-slate-400">
                {label}
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {value || 'Não informado'}
              </dd>
            </div>)}
          </dl>
        </Card>
        <Card>
          <h2 className="mb-5 font-semibold">Documentos de exemplo</h2>
          {role !== 'admin' ? <p className="text-sm leading-6 text-slate-500">A análise de documentos é restrita à coordenação. Troque para o perfil de administrador para testar este fluxo.</p> : <div className="space-y-4">
            {docs.map(d => <div key={d.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap gap-3">
                <FileText className="size-5 text-brand-500" />
                <span className="flex-1 break-all text-sm font-medium">
                  {d.name}
                </span>
                <Badge tone={d.status === 'approved' ? 'green' : d.status === 'pending' ? 'amber' : 'red'}>
                  {d.status === 'approved' ? 'Aprovado' : d.status === 'pending' ? 'Em análise' : 'Rejeitado'}
                </Badge>
              </div>
              {d.status === 'pending' && <div className="flex gap-2">
                <Button variant="secondary" loading={busy} onClick={() => void mutate(draft => {
                  draft.documents.find(doc => doc.id === d.id)!.status = 'approved';
                }, 'Documento de exemplo aprovado.')}>Aprovar</Button>
                <Button variant="ghost" onClick={() => {
                  setReject(d.id);
                  setReason('');
                }}>Rejeitar</Button>
              </div>}
              {d.reason && <p className="text-sm text-rose-600">
                {d.reason}
              </p>}
            </div>)}
            {!docs.length && <p className="text-sm text-slate-400">Nenhum documento enviado.</p>}
          </div>}
        </Card>
      </div>
    </div>
    <Dialog open={!!reject} onClose={() => setReject(null)} title="Rejeitar documento">
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        if (await mutate(d => {
          const doc = d.documents.find(doc => doc.id === reject)!;
          doc.status = 'rejected';
          doc.reason = reason.trim();
        }, 'Documento rejeitado com justificativa.')) setReject(null);
      }}>
        <Textarea label="Motivo da rejeição" value={reason} onChange={e => setReason(e.target.value)} required minLength={8} />
        <Button type="submit" loading={busy} variant="danger">Confirmar rejeição</Button>
      </form>
    </Dialog>
  </>;
}
