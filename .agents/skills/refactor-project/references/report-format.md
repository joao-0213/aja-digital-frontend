# Relatório e evidências

Auditoria/planejamento usam chat por padrão; arquivo/checkpoint só autorizado. Em aplicação use notas do issue ou local acordado, sem registros concorrentes. Não copiar fontes inteiras nem segredos.

## Escopo e cobertura

Registre modo, escopo/exclusões, branch/HEAD inicial, revisão atual, aceite e entradas afetadas. Separe mudanças preexistentes, contribuição da tarefa e arquivos que exigem isolamento por hunk.

Inventário por caminho: status (pendente/analisado/excluído/bloqueado), motivo, revisão/conteúdo e IDs de achados. Informe elegíveis, analisados, pendências/bloqueios e comparações transversais concluídas/faltantes. Não chamar amostra/enumeração de auditoria completa.

## Achados

ID estável, categoria, prioridade, arquivos/linhas atuais, evidência/consumidores, cenário/impacto, diferenças importantes, proposta/destino e classificação (mecânica/decisão humana/manter separado). Tipos incluem relação semântica; lógica inclui efeitos/erros/cancelamento. Confiança qualitativa vem com evidência faltante.

Deduplicate pela causa preservando locais afetados. Priorize impacto e dependências; estilo não recebe severidade de segurança. Zero achados é válido. Registre candidatos rejeitados relevantes, especialmente tipos iguais de domínios distintos.

## Decisões e lotes

Decisão humana: pergunta, alternativas, recomendação, consequências, lotes bloqueados e resposta/autorização existente. Sem resposta, prossiga só nos lotes independentes autorizados.

Lote: IDs resolvidos, arquivos/símbolos e consumidores, dependências/ordem, movimentos/destinos concretos, contratos preservados, mudança funcional autorizada e critérios de entrada/saída. Nem um lote por rename, nem um único lote para todo o projeto.

## Validação e fechamento

- Comando, revisão/conteúdo, resultado real, exit code quando disponível e log existente; falhas/checks não executados com motivo.
- RED/GREEN real por comportamento; baseline/caracterização em refactor puro; documentação sem RED artificial.
- Testes completos, tipos, arquitetura e build padrão/fallback separados; sem inventar cobertura percentual. Limites dos testes e falhas alheias.
- Browser/API: cenário, sessões, DOM final, HTTP real e caminhos de scripts/logs conferidos. Dados fictícios e nenhum segredo. Falha/recarga/concorrência/revogação pertinentes.
- Graphify e diff final; revisores ECC/Ponytail, achados resolvidos/descartados e rechecks pelos mesmos revisores após correções.
- Critérios verificados/abertos, commits por mudança/issue e alterações restantes. Check/revisão obrigatório faltando impede fechamento e alegação de validação.
- Documentação apenas: justificar dispensa dos gates da aplicação, conferir links/comandos/instruções e obter revisão independente.

Convenções: entregar texto exato proposto para `AGENTS.md`, motivo e escopo. Editar só se autorizado, sem duplicar políticas nem impor organização global por uma única extração.
