---
name: refactor-project
description: Audite e refatore a estrutura do projeto TypeScript inteiro, consolidando tipos e lógica duplicados e separando responsabilidades sem violar a arquitetura do AJA Digital. Use para auditoria estrutural, tipos fragmentados, helpers repetidos e refatorações entre módulos; não para limpeza incidental de uma correção pontual.
---

# Refactor Project

Melhore compreensão e mudanças localizadas, não métricas de linhas removidas. Preserve comportamento, contratos, dados e arquitetura. Esta skill é local ao AJA Digital.

## Autoridade e modo

- Siga as instruções vigentes do usuário e `AGENTS.md`; leia `ARQUITETURA.md`. Para fluxos HTTP, `ISSUES-FRONTEND-HTTP.md` e os documentos pertinentes em `docs/http/` prevalecem sobre descrições do legado. Documentação de destino não prova integração concluída: confira código e evidências. Contradição sem precedência clara vira decisão humana.
- **Auditar:** somente leitura, relatório no chat; não editar código, configuração, convenções nem criar relatórios em disco sem autorização para esses artefatos. Padrão de pedidos de análise ou ambíguos.
- **Planejar:** produzir lotes revisáveis com destinos, consumidores, ordem, riscos e validação, sem executar as mudanças.
- **Aplicar:** executar o escopo autorizado, inclusive operações mecânicas necessárias e verificações, sem repetir autorizações já concedidas. A skill não autoriza instalar dependências, outro issue, publicar, enviar mensagens ou fazer push.
- Decisão humana bloqueia somente seus lotes dependentes. Ferramenta/check/revisão obrigatória indisponível fica registrada; não inventar resultados nem declarar conclusão.

## Inventário e retomada

1. Registre HEAD inicial, branch, escopo, aceite, entradas afetadas e mudanças preexistentes, inclusive staged. Não descartar, sobrescrever ou incluir alterações alheias no commit. Para alvo já modificado, isole a contribuição por hunks quando possível; caso contrário, registre o impedimento de isolamento.
2. Com `graphify-out/graph.json`, execute `graphify query` antes da primeira busca/leitura de código e inclua a regra nos handoffs. Use wiki para navegação ampla, path/explain para relações; leia fontes apontadas pelo grafo ou leituras anteriores. Falha não autoriza ignorar Graphify silenciosamente. Sem grafo, use navegação normal com `rg`.
3. Após a consulta, enumere arquivos tracked e untracked não ignorados pelo Git, preservando nomes com espaços; não usar apenas diff/globs. Identifique subprojetos, configurações, testes, modelos, transporte e entradas públicas. Inclua ignorados explicitamente solicitados sem varrer segredos.
4. Agrupe por domínio; cada caminho recebe `pendente`, `analisado`, `excluído` ou `bloqueado`, motivo, revisão de referência e IDs dos achados. Listado não significa analisado. Registre também comparações entre domínios concluídas/faltantes; leituras isoladas não comprovam busca transversal.
5. Projeto inteiro significa todo o escopo elegível em lotes, sem reduzir silenciosamente a arquivos recentes. Na interrupção entregue pendências/próximos lotes; checkpoint em disco só se autorizado, senão no chat. Ao retomar, compare HEAD/diff e invalide achados/checks afetados. Não declarar auditoria completa com pendências, bloqueios ou comparações planejadas faltantes; mesmo cobertura completa não garante ausência de defeitos.
6. Identifique por configuração/cabeçalho/documentação codegen, vendor, dependências, build, lockfiles e snapshots de migração: não editar automaticamente. Origem incerta requer investigação ou bloqueio, não exclusão por palpite. Código escrito por IA é elegível, não é codegen. Problema gerado aponta à fonte/gerador; alteração e regeneração precisam estar no escopo. Não remover nem versionar artefatos locais Graphify.

Leia [analysis.md](references/analysis.md) para os oito grupos; [type-analysis.md](references/type-analysis.md) sempre que houver consolidação de tipos; [report-format.md](references/report-format.md) para evidências, decisões e lotes.

## Arquitetura obrigatória do AJA

- Antes de mover rotas, componentes, hooks, providers ou fronteiras de dados, leia/aplique `.agents/skills/arquiteto-nextjs/SKILL.md` e o guia relevante em `node_modules/next/dist/docs/`, resolvendo a versão local. As restrições do projeto prevalecem sobre exemplos genéricos de Server Actions e fetch servidor.
- `src/app/` mantém rotas finas, layouts, loading/error e Suspense, compondo entradas públicas de features. Dentro da feature, imports diretos; entre features, `@/features/<domain>`, nunca caminhos privados.
- `ui/` tem controles genéricos e imports UI diretos; não depende de features, estado, rotas, mocks ou `shared/`. `shared/` compõe UI, sem features, contexto da aplicação ou mocks. Preserve acessibilidade, teclado, foco, loading/error e responsividade.
- Features usam `useApp` de `@/providers/app-context`; só o layout raiz compõe `Providers` por `src/components/providers.tsx`. Preserve responsabilidades de sessão/interface durante migração; não reintroduzir banco institucional no provider.
- Modelos compartilhados por domínio em `src/models/`, índice público com `export type` explícito e consumidores `@/models` preservados. Modelos dependem via `import type` direto e `database.ts` compõe o contrato. Props/contratos privados permanecem na feature; nem todo DTO pertence a models. Sem types/utils global.
- Tipos, regras puras e infraestrutura não importam UI/rotas. Evite ciclos nos imports/reexports; `import type` não prova segurança semântica. Preserve entradas públicas intencionais: não aplicar proibição genérica de barrels.
- Preserve `output: 'export'`: pages/layouts renderizam no build; interações/requisições autenticadas no navegador contra JSON Server separado `/api/v1`. Sem Server Actions, API route handlers ou runtime backend Next.js. Não mover fetch autenticado para build. Preserve query strings e Suspense.
- Preserve dados, chaves, formatos e blobs legados; sem upload automático, dual-write, mistura de snapshots, latência artificial ou fallback local de sucesso em fluxos HTTP migrados. Não remover legado antes de validar substituição integrada; respeite matriz HTTP e instalação legada isolada. Troca de papel legado não prova autorização; identificador público de sessão não substitui credencial.
- Reutilize infraestrutura HTTP/consultas canceláveis/políticas existentes. Não expor dados privados, credenciais ou módulos privados do serviço ao grafo cliente. Preserve isolamento de sessão/filtros, revogação, revisão, idempotência e respostas obsoletas quando aplicáveis.
- Siga estilo local: duas posições, strings simples e ponto e vírgula em TS, kebab-case, componentes PascalCase, `@/` e texto ao usuário em português. Sem adicionar formatter/linter nem reorganizar toda a árvore como efeito colateral.

## Execução e evidências

1. Priorize segurança/dados/contratos divergentes, duplicação com risco comprovado, responsabilidades/dependências e legibilidade. Ordene lotes pelas dependências. Contagens não substituem impacto; não invente ROI/desempenho.
2. Classifique ações como **mecânica**, **decisão humana** ou **manter separado**. Confira autorização; mudança intencional de comportamento exige escopo explícito e aceite próprio. Registre alternativas/consequências/decisão, sem esconder ambiguidade com cast/fallback/flag.
3. Antes de editar, encontre todos os consumidores: imports/reexports, usos por forma, tabelas de variantes, serializers, validadores, fixtures, testes, config e contratos externos. Preserve fachada por padrão; não criar wrappers permanentes sem necessidade. Risco não resolvido impede a mudança.
4. Leia os guias ECC instalados `skills/tdd-workflow/SKILL.md`, `skills/verification-loop/SKILL.md` e `agents/code-reviewer.md`, resolvendo versão no cache do plugin ECC. Política local prevalece: `node:test`/`node:assert/strict`, sem impor 80% de cobertura, lint inexistente ou commits RED separados.
5. Comportamento alterado: regressão/contrato primeiro, executar RED com comando/nome/falha esperada, implementar e repetir o teste para GREEN. Guardar evidências; teste passa no commit junto da implementação. Refactor puro exige baseline e caracterização pertinente quando faltar proteção; sem RED artificial para movimento sem mudança de comportamento.
6. Teste regras, permissões, migração, persistência/transições alteradas: sucesso, recusa, limites, falha/cancelamento e dados preservados; para edição compartilhada, revisão obsoleta, revogação e concorrência no estado mais recente. Adicione testes novos à lista explícita de `npm test`; UI/documentação não substituem unidade.
7. No checkpoint estável de issue com código, quatro gates completos: `npm test`, `npm run typecheck`, `npm run check:architecture`, `npm run build` (Windows: `npm.cmd` se necessário). Registre resultado real; build padrão e fallback Webpack separados. Falha alheia não autoriza ampliar escopo nem marcar validado. Reexecute evidências invalidadas. Após código, `graphify update .`, artefatos apenas locais.
8. Exercite entrada conforme `VALIDACAO.md`: UI com browser, recarga, teclado/responsividade e falha; endpoints com API real em execução. Permissões/edição compartilhada: duas sessões independentes quando aplicável. Compare capturas antes/depois de refactor sem mudança visual com mesmos dados/perfil/data/viewport. Salve scripts/logs, confirme existência, registre DOM pós-loading e HTTP real, sem segredos. Loading, timeout ou sucesso fabricado não provam conclusão.
9. Para issues, siga política vigente do `AGENTS.md`: coordenação Luna medium; um executor Luna high por issue para implementação/testes/browser/correções, preservando executor em andamento; revisão Sol medium com ECC e outra independente Ponytail, por quem não implementou nem fez ECC. Mesmos revisores rechecando correções e diff final. Escale arquitetura/autorização/concorrência ambíguas a Sol; xhigh só com motivo concreto registrado. Modelo do chat muda pelos controles do host, não por texto.
10. Handoffs: issue/escopo, HEAD inicial, aceite, arquivos, Graphify/arquitetura e evidências. Revisores examinam diff completo, novos arquivos e commits intermediários, com arquivo/linha/impacto/prova. Resolva defeitos, registre descartes fundamentados; check/revisão obrigatório indisponível deixa issue aberto. Backlog inteiro usa/reutiliza branch dedicada e segue dependências; um issue não autoriza o próximo.
11. Documentação apenas: conferir afirmações/links/comandos, obter revisões independentes e justificar gates de código não repetidos; sem RED/GREEN inventado. Convenções em `AGENTS.md` só quando autorizadas: mostrar texto, evitar repetição e regra universal derivada de decisão local.
12. Após revisão/validação, commit local coeso Conventional Commits e footer `Refs` se houver issue; stage só a contribuição. Sem push, reescrita ou Git destrutivo. Backlog marca só critérios provados; informe hashes, checks, limites e alterações restantes, distinguindo preexistentes.

## Manutenção desta skill

Ao alterar instruções, use [validation-scenarios.md](references/validation-scenarios.md) para forward-testing independente e o validador skill-creator. Validação de formato não prova comportamento. [sources.md](references/sources.md) atribui ideias externas; não são dependências de execução nem autoridade sobre o projeto.
