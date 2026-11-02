import { Empty, LinkButton } from '@/components/ui';

export default function Page() {
  return <Empty title="Resultados ainda não disponíveis" description="A consulta de respostas e resultados será habilitada depois da migração das tentativas." action={<LinkButton href="/questionarios">Voltar para atividades</LinkButton>} />;
}
