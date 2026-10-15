export function PublicationDate({ value }: { value?: string }) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return <span>Data de publicação não informada</span>;
  return <span>Publicado em <time dateTime={value}>{date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</time></span>;
}
