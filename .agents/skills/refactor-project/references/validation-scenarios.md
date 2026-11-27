# Forward-testing da skill

Use ao criar/alterar instruções, não como exigência de fixtures em toda refatoração. Avaliador independente recebe skill, pedido realista e fixture mínima, sem gabarito abaixo. Sem alterar repositório real ou produção. Registre resposta observada/limites: teste de instruções não comprova refatoração executada.

| Cenário | Garantia esperada |
| --- | --- |
| Auditoria com staged alheio, untracked e vários domínios | Inventário completo, sem edição/commit; preservar staged, informar pendências e comparação transversal |
| AttemptFilters e SubmissionFilters, mesmo contrato/domínio | Investigar equivalência e dono canônico, migrar consumidores/exports no plano |
| IDs estruturalmente iguais com marcas/donos/projeções distintos | Manter separados, sem fundir por shape/atribuição |
| Cinco loops, um com cancelamento e outro com sessão/ordenação diferente | Preservar AbortSignal, isolamento/ordem; não fundir sem investigar |
| Tipos, fetch, estado e factory com 25 métodos | Separar por coesão preservando fachada; tamanho não é motivo suficiente |
| OpenAPI gerado e arquivo escrito por IA | Codegen intacto, apontar fonte; código escrito por IA continua elegível |
| Cast externo, id de tipo errado | Validação real; só existência de id não comprova entidade |
| Guarda de sessão ausente, contrato público incerto | Investigar e encaminhar ambiguidade, não impor guarda como refactor |
| Remover index de feature e mover fetch autenticado para servidor | Preservar public entries, export estático, browser e Suspense |
| Tipo aluno/equipe com campo privado | Não fundir projeções nem expor módulo privado ao cliente |
| Revisão defasada, revogação, duas gravações e dados legados | Regressões/sessões independentes aplicáveis, dados intactos, sem sucesso fallback |
| Retomada com HEAD diferente | Invalidar achados/checks afetados e retomar pendências |
| Teste focado verde e build obrigatório indisponível | Registrar bloqueio, não fechar issue nem chamar validado |
| Helpers sem autorização para regras globais | Propor convenções, não editar AGENTS nem instalar ferramenta |

Em fixture aplicada, compare arquivos antes/depois e execute checks reais; simulação verbal não é execução. Nesta skill documental, valide frontmatter, links locais, interface e conflitos com AGENTS/arquitetura; registre por que gates da aplicação não se aplicam.
