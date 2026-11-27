'use client';

import { useState } from 'react';
import { Button, Dialog } from '@/components/ui';

export function PrivacyNotice() {
  const [open, setOpen] = useState(false);
  return <><Button variant="ghost" onClick={() => setOpen(true)}>Privacidade</Button><Dialog open={open} onClose={() => setOpen(false)} title="Privacidade"><div className="space-y-4 text-sm leading-6 text-slate-600">
    <h3 className="font-semibold text-slate-900">Conta e acesso</h3>
    <p>Nome e e-mail identificam sua conta. Sua senha é protegida e nunca é exibida a outros usuários. Um cookie de sessão mantém seu acesso ativo até você sair da conta.</p>
    <h3 className="font-semibold text-slate-900">Dados acadêmicos</h3>
    <p>Seu perfil e seus vínculos definem o acesso às turmas e disciplinas. Alunos acompanham seus próprios registros; docentes acessam as disciplinas atribuídas; a administração gerencia contas, turmas e matrículas.</p>
    <p>Respostas, entregas, devolutivas e frequência apoiam o acompanhamento das aulas. Avisos e publicações do fórum ficam visíveis apenas para os participantes da turma ou disciplina correspondente.</p>
    <h3 className="font-semibold text-slate-900">Confirmação e recuperação</h3>
    <p>Pedidos de confirmação de e-mail e recuperação de senha geram links individuais de uso único. Nunca compartilhe sua senha nem links de recuperação.</p>
    <h3 className="font-semibold text-slate-900">Histórico e solicitações</h3>
    <p>Encerrar uma matrícula ou retirar uma publicação preserva o histórico acadêmico necessário para acompanhamento pedagógico. Para solicitações de acesso, correção ou exclusão de dados pessoais, procure a coordenação do cursinho.</p>
    <p>Rascunhos temporários de formulários podem ser guardados localmente no navegador durante sua sessão para evitar perda acidental de texto.</p>
  </div></Dialog></>;
}
