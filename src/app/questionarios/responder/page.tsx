import { Empty, LinkButton } from '@/components/ui';

export default function Page() {
  return <Empty title="Envios ainda não disponíveis" description="A retomada de questionários e o envio de trabalhos serão habilitados depois da migração das tentativas e entregas." action={<LinkButton href="/questionarios">Voltar para atividades</LinkButton>} />;
}
