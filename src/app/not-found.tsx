import { Card, LinkButton, PageHeading } from '@/components/ui';
export default function NotFound() {
  return <Card><PageHeading title="Página não encontrada" description="Verifique o endereço ou volte ao painel para continuar." /><LinkButton href="/">Voltar ao painel</LinkButton></Card>;
}
