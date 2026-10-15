'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Dialog, Empty, Input, PageHeading, Select } from '@/components/ui';
import { roleLabels, textMatch } from '@/lib/utils';
import { canChangeRole } from '@/lib/domain';
import { type Role } from '@/models';

export function UsersPage() {
  const {
    db,
    role,
    mutate,
    busy
  } = useApp();
  const [search, setSearch] = useState('');
  const [change, setChange] = useState<{
    id: string;
    role: Role;
  } | null>(null);
  if (role !== 'admin') return <Empty title="Área da administração" description="Selecione o perfil de administrador para gerenciar cargos na demonstração." />;
  const admins = db.users.filter(u => u.role === 'admin').length;
  return <>
    <PageHeading eyebrow="Gestão de acesso" title="Usuários e cargos" description="Gerencie os perfis de acesso desta demonstração." />
    <div className="mb-6 max-w-md">
      <Input aria-label="Buscar usuário" value={search} onChange={e => setSearch(e.target.value)} placeholder="Busque nome ou e-mail…" />
    </div>
    <Card className="!p-0 overflow-hidden">
      <p className="px-5 pt-4 text-xs text-slate-500 sm:hidden">Deslize para ver todas as colunas.</p>
      <div className="relative overflow-x-auto" role="region" aria-label="Lista de usuários e cargos" tabIndex={0}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-5 font-medium">Usuário</th>
              <th className="p-5 font-medium">E-mail</th>
              <th className="p-5 font-medium">Perfil</th>
              <th className="p-5 font-medium">Alterar cargo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {db.users.filter(u => textMatch(u.name + ' ' + u.email, search)).map(u => <tr key={u.id}>
              <td className="p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} size="sm" />
                  <span className="whitespace-nowrap font-semibold">
                    {u.name}
                  </span>
                </div>
              </td>
              <td className="p-5 text-slate-500">
                {u.email}
              </td>
              <td className="p-5">
                <Badge tone={u.role === 'admin' ? 'purple' : u.role === 'teacher' ? 'amber' : 'neutral'}>
                  {roleLabels[u.role]}
                </Badge>
              </td>
              <td className="min-w-52 p-5">
                <Select aria-label={`Cargo de ${u.name}`} value={u.role} onChange={e => setChange({
                  id: u.id,
                  role: e.target.value as Role
                })} disabled={u.role === 'admin' && admins === 1}>
                  <option value="student">Aluno</option>
                  <option value="teacher">Professor</option>
                  <option value="admin">Administrador</option>
                </Select>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Card>
    <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="size-4" />O último administrador não pode ser removido. Permissões reais devem ser validadas no backend.</p>
    <Dialog open={!!change} onClose={() => setChange(null)} title="Alterar perfil de acesso?">
      <p className="mb-5 text-sm leading-6">{db.users.find(u => u.id === change?.id)?.name} passará a ser {change ? roleLabels[change.role].toLowerCase() : ''}. Esta alteração afeta apenas os dados da demonstração.</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => setChange(null)}>Cancelar</Button>
        <Button loading={busy} onClick={async () => {
          if (change && (await mutate(d => {
            const u = d.users.find(u => u.id === change.id)!;
            if (!canChangeRole(u, change.role, d.users)) throw new Error('Não é possível remover o último administrador.');
            u.role = change.role;
          }, 'Perfil atualizado. Notificação ao usuário simulada.'))) setChange(null);
        }}>Confirmar alteração</Button>
      </div>
    </Dialog>
  </>;
}
