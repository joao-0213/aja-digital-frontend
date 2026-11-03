# Investigação estrutural

Investigue todos os grupos no escopo, sem fabricar achados para preencher categorias. Cite fontes atuais, consumidores e testes; grafo e buscas são pistas, não prova. Contagens nunca autorizam uma extração sozinhas.

| Grupo | Comparação necessária | Resultado seguro |
| --- | --- | --- |
| Responsabilidades misturadas | Tipos, transporte, regras puras, estado/transições e composição React; razões independentes para mudar | Unidades coesas e dependências permitidas, sem camadas especulativas ou classe por função |
| Tipos duplicados/fragmentados | Nomes diferentes e formas equivalentes em outros módulos; usar type-analysis.md | Contrato canônico ou distinção intencional documentada |
| Tipos frágeis/redundantes | Staff/Student iguais, interfaces vazias, extensões sem membros, opcionais que codificam estados e uniões ambíguas | Preservar identidade/contrato público; discriminante só se realmente garantido ou mudança de contrato autorizada |
| Lógica duplicada | Paginação, mapeamento, validação, políticas, erros, filtros, normalização e transições | Buscar helper existente, provar equivalência; parecido não significa igual |
| Assertions | `as`, casts encadeados, non-null assertions, `any`, `@ts-ignore` e escapes que ocultam incompatibilidade | Inferência, narrowing, tipo correto na origem e validação pertinente na fronteira; `satisfies` não valida entrada em execução |
| Inconsistências | Guardas de sessão/permissão, erros, língua de mensagens e helpers canônicos | Distinguir endpoint público de guarda ausente; não uniformizar autorização sem contrato |
| Legibilidade | Interfaces em linha única, nomes, ordem de leitura e blocos extensos | Formatação local, seções apenas quando úteis, sem comentários narrativos ou ferramenta nova |
| Superfície pública extensa | Factory com muitas funções, coesão e consumidores | Primeiro separar implementação preservando fachada; 25 funções não exigem nova API pública |

## Equivalência da lógica

Descreva propósito, domínio, entradas, saída, pré-condições, efeitos, erros, ordem, tempo de execução, consumidores e testes. Consulte histórico apenas quando necessário à decisão.

Para paginação compare sessão/filtros, sort/desempate, cursor/offset, término inclusive página vazia, limites, duplicatas, retry, cancelamento, falha parcial e respostas obsoletas. Não extrair ignorando AbortSignal ou alterando o instante da guarda de sessão.

Compartilhe quando as cópias representarem o mesmo conhecimento e devam evoluir pelo mesmo motivo. Flags de persona/transporte e imports privados entre features sugerem abstração inadequada. Manter separado é resultado válido; reutilize infraestrutura existente antes de criar helper.

## Segurança e comportamento

Autorização, erros observáveis/idioma, ordem, serialização, persistência, coerção e discriminantes podem mudar comportamento. Registre correções funcionais separadamente e exija autorização/aceite quando não incluídas no escopo; não disfarçar como movimento mecânico.

Guardas precisam validar o contrato afirmado, não apenas a existência de uma propriedade. Reutilize validadores; teste entradas aceitas/rejeitadas, campos faltantes, tipos errados e nulabilidade. Não revalidar todo valor interno já validado sem fronteira que justifique isso. `as const` e assertions justificadas pelo contrato da plataforma não são defeitos automáticos. Interface vazia pode preservar extensão/contrato público.

Não perder validação, catch, lock, revisão, cancelamento ou limpeza de efeitos na extração. Preserve acesso, consistência e UX. Desempenho exige caminho/custo demonstrados, não memoização/cache por hábito.
