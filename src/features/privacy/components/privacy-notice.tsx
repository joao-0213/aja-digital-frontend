'use client';

import { useState } from 'react';
import { Button, Dialog } from '@/components/ui';

export function PrivacyNotice() {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="ghost" onClick={() => setOpen(true)}>Privacidade nesta demonstração</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Privacidade nesta demonstração">
      <div className="space-y-4 text-sm leading-6 text-slate-600">
        <p>Use somente nomes, e-mails e arquivos fictícios. Este protótipo guarda dados neste navegador. Não há backend, envio de e-mail, confirmação real de identidade ou atendimento institucional.</p>
        <h3 className="font-semibold text-slate-900">Quais dados aparecem e para quê</h3>
        <p>Nome e e-mail identificam a conta. Papel, estado da conta e vínculos definem o contexto de acesso. Matrículas pendentes guardam e-mail e turma até o cadastro e a confirmação simulada.</p>
        <p>Respostas, entregas e retornos apoiam a prática individual; frequência registra participação nas aulas. Avisos e dúvidas do fórum são compartilhados no contexto da turma ou disciplina.</p>
        <h3 className="font-semibold text-slate-900">Quem pode consultar</h3>
        <p>O aluno consulta seus registros acadêmicos. Docentes consultam as disciplinas atribuídas e os registros necessários ao acompanhamento. A administração gerencia contas e vínculos. Trocar o perfil na demo não é autenticação real; os dados fictícios ficam no navegador.</p>
        <h3 className="font-semibold text-slate-900">Cancelamento e histórico</h3>
        <p>Cancelar ou encerrar um registro retira seu uso operacional e preserva histórico e auditoria mínima. Isso não elimina os dados armazenados nem significa guarda permanente. Não há lixeira ou restauração pela interface.</p>
        <h3 className="font-semibold text-slate-900">Antes de usar dados reais</h3>
        <p>Será necessário definir responsável e canal institucional, validar finalidades, bases legais, retenção e cuidados com adolescentes, e implementar autenticação, permissões e segurança efetivas. Responsáveis e contatos da matrícula presencial não são coletados novamente aqui.</p>
        <p>O canal institucional para solicitações ainda não está definido. Em uma operação real, correção, acesso e eliminação deverão seguir procedimento com confirmação de identidade. A demo não recebe nem encaminha pedidos. Este aviso é informativo; a confirmação de uso de dados fictícios não é um consentimento genérico para tratamento real.</p>
      </div>
    </Dialog>
  </>;
}
