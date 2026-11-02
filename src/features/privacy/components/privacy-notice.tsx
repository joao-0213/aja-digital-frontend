'use client';

import { useState } from 'react';
import { Button, Dialog } from '@/components/ui';

export function PrivacyNotice() {
  const [open, setOpen] = useState(false);
  return <><Button variant="ghost" onClick={() => setOpen(true)}>Privacidade</Button><Dialog open={open} onClose={() => setOpen(false)} title="Privacidade"><div className="space-y-4 text-sm leading-6 text-slate-600">
    <h3 className="font-semibold text-slate-900">Conta e acesso</h3>
    <p>Nome e e-mail identificam sua conta. A senha é verificada pelo serviço e não é exibida a outros usuários. Um cookie de sessão mantém sua entrada; sair encerra essa sessão.</p>
    <h3 className="font-semibold text-slate-900">Dados acadêmicos</h3>
    <p>Papel, estado da conta e vínculos determinam o acesso às turmas. Alunos consultam seus registros; docentes acessam disciplinas atribuídas e registros necessários ao acompanhamento; a administração gerencia contas e vínculos.</p>
    <p>Respostas, entregas, retornos e frequência apoiam o acompanhamento acadêmico. Avisos e publicações do fórum são compartilhados no contexto permitido. Os dados são mantidos pelo serviço, com verificações de permissão em cada operação.</p>
    <h3 className="font-semibold text-slate-900">Confirmação e recuperação</h3>
    <p>Solicitações de confirmação de e-mail e recuperação de acesso geram instruções de uso único. A mensagem de solicitação aceita não comprova a entrega de um e-mail. Nunca compartilhe sua senha ou link de recuperação.</p>
    <h3 className="font-semibold text-slate-900">Histórico e solicitações</h3>
    <p>Encerrar um vínculo ou retirar uma publicação preserva o histórico necessário e não equivale à eliminação dos dados. O canal institucional para pedidos de acesso, correção e eliminação ainda não está definido. Esta interface não recebe nem encaminha esses pedidos.</p>
    <p>Preferências de interface e recuperação temporária de texto podem ser mantidas no navegador, separadas por conta e contexto. Dados de versões anteriores no navegador permanecem preservados e não são enviados automaticamente ao serviço.</p>
  </div></Dialog></>;
}
