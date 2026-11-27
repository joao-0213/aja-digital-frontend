# AJA Digital | Correção e limpeza da arquitetura

Backlog aberto, preparado na branch `refactor/arquitetura` a partir de `4b1543509b727443700a8fc6c53a1a9676d4bdd4`, com a árvore limpa. O critério de sucesso é reduzir os pontos em que uma mudança precisa ser feita ou revisada, preservando o comportamento observável do produto.

## Contratos de preservação

- Manter as 22 rotas da matriz, query strings, navegação, Suspense, estados visuais, acessibilidade e texto da interface. O Next.js continua com exportação estática. Requisições autenticadas continuam no navegador.
- Preservar as operações `/api/v1`, incluindo métodos, URLs, parâmetros, corpos, cabeçalhos, status, códigos e mensagens de erro, distinção entre ausência e `null`, ordenação e projeções por perfil. A configuração padrão continua usando o gateway em `3002`. O JSON Server continua disponível no fluxo isolado em `3102`.
- Preservar autorização, revalidação de vínculo, captura de revisão, atomicidade, idempotência, isolamento de sessão, cancelamento e descarte de respostas obsoletas. Preservar os formatos de rascunho em uso e os dados legados do navegador, inclusive anexos e chaves. Falha HTTP mantém seu comportamento atual, inclusive recuperação e repetição explícita.
- Preservar os pontos de entrada públicos das features e `@/models`. Divergências funcionais encontradas durante uma extração devem ser registradas separadamente para decisão. O lote só avança quando a equivalência pode ser demonstrada.

[Arquitetura](ARQUITETURA.md) · [Contrato HTTP](docs/http/contract.md) · [OpenAPI](docs/http/openapi.json) · [Matriz de rotas](docs/http/route-matrix.md) · [Inventário de armazenamento](docs/http/storage-inventory.md) · [Validação](VALIDACAO.md)

## Ordem de execução

| Issue | Prioridade | Depende de | Entrega |
| --- | --- | --- | --- |
| ARQ-01 | Alta | — | Unificar leitura de imports nos verificadores de arquitetura |
| ARQ-02 | Alta | ARQ-01 | Separar o legado de teste dos módulos usados pelo navegador |
| ARQ-03 | Média | ARQ-01 | Retirar módulos órfãos e validar as rotas pelo export real |
| ARQ-04 | Média | ARQ-01 | Compartilhar o envelope e a coleta de páginas HTTP equivalentes |
| ARQ-05 | Média | ARQ-04 | Separar contratos, transporte e comandos das avaliações |
| ARQ-06 | Média | ARQ-05 | Separar a apresentação da autoria do fluxo de gravação |
| ARQ-07 | Média | — | Separar a apresentação do diálogo de matrícula em lote |
| ARQ-08 | Média | — | Isolar as operações de tentativa no mock HTTP |
| ARQ-09 | Média | — | Alinhar a documentação operacional ao gateway padrão |

ARQ-06 segue ARQ-05 porque ambas tocam a autoria. ARQ-07, ARQ-08 e ARQ-09 podem avançar de forma independente. Quando dois lotes precisarem editar o mesmo módulo ou a lista de testes de `package.json`, integrar em sequência e revalidar o segundo a partir do novo HEAD.

## Issues

### ARQ-01 · Unificar leitura de imports nos verificadores de arquitetura

**Evidência.** O check arquitetural percorre `.ts`/`.tsx`, resolve imports locais por uma lista própria e avalia somente declarações estáticas. A política cliente usa outra lista de extensões, consulta `tsconfig.json` e também encontra `import()` literal. Ela reconhece `import type` e `export { type … }` para `models/database`, mas classifica `import { type … }` de forma diferente. Essas diferenças dificultam usar os dois checks como proteção ao mover módulos. [Check arquitetural](scripts/check-architecture.mjs#L9) · [Política cliente](scripts/client-import-policy.mjs#L63) · [Testes da fronteira](tests/client-boundary.test.mjs)

- [ ] Reutilizar uma única leitura de referências locais baseada no TypeScript já instalado. Registrar arquivo, especificador e natureza da referência. Cada check mantém sua política. A política cliente continua cobrindo sementes, código do mock, fixtures e transporte legado. O check arquitetural continua distinguindo ciclos estáticos de referências apagadas pelo TypeScript e aplica as fronteiras de módulo também ao `import()` literal.
- [ ] Cobrir antecipadamente os casos ausentes, com fixtures mínimas de teste, fora de `src/`. Incluir import relativo e alias, reexport, segmento privado de feature, import dinâmico literal, dependência só de tipo, import misto com valor e ciclo estático. Preservar a classificação das referências existentes e os diagnósticos de caminhos inválidos. Manter `npm run check:architecture` e `npm test` como pontos de entrada.
- [ ] Demonstrar que os checks detectam cada violação esperada e aceitam as entradas válidas. Executar a checagem de `out/` e confirmar uma rota pública e um detalhe protegido por query string no export. Entrega restrita aos verificadores e testes.

### ARQ-02 · Separar o legado de teste dos módulos usados pelo navegador

**Evidência.** `demo-storage.ts` e `demo-mutations.ts` estão fora do grafo de rotas e são exercitados pelos testes históricos. Já `assessment-attempts.ts`, `announcement-calendar.ts` e `attendance.ts` misturam operações sobre o banco legado com funções consumidas por quiz, painéis e frequência. `access.ts`, `enrollment.ts`, `activities.ts`, `question-composition.ts` e `subject-updates.ts` têm consumidores ativos no mock HTTP. [Legado](src/lib/demo-storage.ts) · [Mutações](src/lib/demo-mutations.ts) · [Quiz](src/features/assessments/components/quiz-session.tsx#L8) · [Calendário](src/lib/announcement-calendar.ts) · [Frequência](src/lib/attendance.ts) · [Serviço de avaliações](server/assessment-service.mjs#L2)

- [ ] Mover armazenamento, mutações e funções exclusivamente históricas para `tests/support/legacy/`, junto dos testes consumidores atualizados. Migrar em um primeiro commit os dois módulos `demo-*`. Nos commits seguintes, separar por domínio as funções legadas dos módulos mistos, preservando os helpers ativos e as dependências do mock. Manter a definição e o export type-only de `MockDatabase` no destino atual.
- [ ] Atualizar os testes de fronteira para o destino novo. Testar que UI e mock em execução não dependem do suporte histórico. Manter as regressões que exercitam as regras da versão antiga, incluindo estados inválidos e preservação de dados. Conferir os consumidores ativos antes de mover cada export, inclusive os testes de recuperação, painel, frequência e contrato HTTP.
- [ ] No navegador, semear dados legados fictícios e comparar chaves, valores e Blob antes e depois da primeira abertura e da recarga. Conferir sessão inicialmente anônima, tráfego sem dados legados e recuperação atual de quiz na mesma conta e revisão. Conferir painel e frequência após o carregamento e durante falha real da API. Usar o teste de exportação como evidência complementar. [Cenário de corte AJA-17](docs/http/validation-AJA-17.md)

### ARQ-03 · Retirar módulos órfãos e validar as rotas pelo export real

**Evidência.** `RichTextEditor` e `useRecordRevision` não têm consumidores encontrados no inventário de imports nem na busca pelos símbolos. `httpRoutes` só é lido pelo próprio teste, que comprova a presença de strings no `Set`. A aplicação usa entradas reais do App Router, shell, matriz e export estático. [Editor órfão](src/components/ui/rich-text-editor.tsx) · [Hook órfão](src/hooks/use-record-revision.ts) · [Lista órfã](src/lib/http-routes.ts) · [Teste atual](tests/http-route-gate.test.ts) · [Verificação do export](scripts/check-static-export.mjs)

- [ ] Confirmar a ausência de consumidores, reexports e entradas dinâmicas no HEAD da issue. Remover os dois módulos órfãos em um commit mecânico.
- [ ] Transferir a asserção de existência de rotas para o verificador de `out/`, usando a matriz vigente como referência e sem criar outra lista paralela. Verificar as 22 páginas de produto, distinguindo o caminho exportado dos parâmetros de navegação. Só então retirar `httpRoutes`, seu teste isolado e a entrada correspondente no `package.json`.
- [ ] Demonstrar falha do verificador com uma página ausente em fixture, sem apagar a saída real. Na saída real, validar recarga direta em rota pública e protegida, incluindo `/disciplinas/detalhes?id=s1` e as URLs de atividade da matriz. Provar a autorização nos cenários de navegador/API aplicáveis pelo fluxo real. A presença de HTML em `out/` comprova existência de rota.

### ARQ-04 · Compartilhar o envelope e a coleta de páginas HTTP equivalentes

**Evidência.** Pelo contrato, listas paginadas respondem `{ items, page, pageSize, total }`. APIs de turmas, disciplinas, calendário, avisos, fórum, materiais, frequência e avaliações repetem a coleta a partir da página 1 até `total` ou página vazia. Perfil também repete o loop. Materiais e avaliações verificam a sessão antes e depois de chamadas específicas. O roster de avaliações tem término próprio após a seleção de alunos ativos. [Contrato](docs/http/contract.md#L35) · [Turmas](src/features/classes/api.ts#L16) · [Fórum](src/features/forum/api.ts#L16) · [Materiais](src/features/materials/api.ts#L44) · [Avaliações](src/features/assessments/api.ts#L256) · [Roster](src/features/assessments/api.ts#L362) · [Perfil](src/features/profile/components/profile-page.tsx#L23)

- [ ] Definir o envelope completo por tipo em `src/models/` com export type-only explícito e usar esse tipo nas respostas equivalentes. Preservar os nomes de tipos já publicados pelas features. Respostas que só têm `items` ou representam projeções diferentes mantêm seu contrato.
- [ ] Concentrar a coleta equivalente em `src/lib/http-pagination.ts`, com um callback que busca uma página. Manter URL, filtros, tamanho 20/100, ordenação e `AbortSignal` no chamador. Em consultas com guardas de sessão, manter o callback com as mesmas checagens e na mesma ordem. Migrar primeiro turmas, disciplinas e calendário, depois avisos, fórum, perfil, frequência, materiais e avaliações em commits verificáveis.
- [ ] Preservar separadamente o roster de avaliações e a agregação por mapa de `read_study_materials`. Preservar a concorrência entre listas independentes e a sequência dentro de cada lista. Caracterizar páginas múltiplas, total variável, página intermediária vazia, ordem, falha no meio, aborto e troca de sessão. Validar chamadas e falhas no navegador em ao menos uma rota que use cada estratégia migrada, com os testes dos adaptadores cobrindo os demais consumidores.

### ARQ-05 · Separar contratos, transporte e comandos das avaliações

**Evidência.** `assessments/api.ts` concentra DTOs de três jornadas, preparação local de envio e composição de requisições. Disciplinas e painel usam sua fachada pública. `AssessmentSubject` e `SubjectSummary` descrevem os mesmos campos da resposta de `GET /subjects`, e materiais já usa `SubjectSummary`. O quiz usa `createAttemptSubmitCommand`. A tela de trabalho mantém a intenção em `submitIntent` e a recupera por revisão, enquanto `createWorkSubmitCommand` só é consumido por um teste isolado. [API de avaliações](src/features/assessments/api.ts#L112) · [Trabalho](src/features/assessments/components/work-activity.tsx#L154) · [Teste isolado](tests/assessments-client.test.ts#L54) · [DTO de disciplinas](src/features/subjects/api.ts#L5) · [Materiais](src/features/materials/api.ts#L3) · [Disciplina](src/features/subjects/components/subject-details.tsx#L20) · [Painel](src/features/dashboard/components/student-dashboard.tsx#L9)

- [ ] Usar `SubjectSummary` como tipo canônico da consulta, por import type da entrada pública de disciplinas, mantendo `AssessmentSubject` como nome compatível. Conferir equivalência bidirecional, campos obrigatórios e amostras autorizadas de `GET /subjects` no contrato atual.
- [ ] Manter `createAssessmentsApi`, suas assinaturas, valores padrão e exports da entrada pública da feature. Separar os DTOs em módulos privados por jornada e mover o controlador ativo do quiz para `lib/`. Manter `submitIntent` e sua recuperação no fluxo atual de trabalho. Caracterizar no navegador a repetição desse fluxo antes de retirar a fábrica de trabalho sem consumidor e seu teste isolado. Extrair adaptadores privados de tentativa e entrega somente onde operações e checagem de sessão formam uma unidade coesa. Preservar a origem da sessão capturada e os DTOs por papel.
- [ ] Caracterizar e comparar método, URL, opções, payload, ordem de requisições, revisão e chave de repetição. Cobrir respostas obsoletas, perda de resposta e reenvio, inclusive reuso da mesma intenção após falha. No navegador, criar/publicar atividade, iniciar/retomar/enviar quiz e abrir resultado, preparar/enviar trabalho e abrir retorno. Conferir com dois perfis que a projeção de aluno e a de equipe preservam os respectivos campos. [Testes do cliente](tests/assessments-client.test.ts) · [Tentativas](tests/http-attempts.test.mjs) · [Entregas](tests/http-submissions.test.mjs)

### ARQ-06 · Separar a apresentação da autoria do fluxo de gravação

**Evidência.** `AssessmentEditor` concentra a edição de campos, composição e prévia de questões, avisos de saída/reinício, intenções de criação/publicação e revalidação após conflito. Há cobertura da recuperação depois da primeira entrega, mas a equivalência da montagem de diálogos, do foco e da sequência de gravação precisa de evidência no navegador. [Editor](src/features/assessments/components/assessment-builder.tsx#L74) · [Gravação](src/features/assessments/components/assessment-builder.tsx#L216) · [Testes do editor](tests/assessment-editor.test.ts)

- [ ] Extrair a apresentação da lista/prévia de questões e dos diálogos de autoria para componentes privados de avaliações. Manter o estado, callbacks, confirmação, chaves React e coordenação de gravação no mesmo dono. Só mover funções puras de composição local se houver uma fronteira útil. Usar os controles existentes e preservar a ordem e a semântica dos elementos.
- [ ] Em `/questionarios/criar`, comparar antes/depois com os mesmos dados e viewport. Cobrir nova atividade e edição com query string, reordenação, confirmação de publicação e cancelamento, recuperação após o primeiro envio do aluno, aviso de perda de alterações, foco e Escape. Comparar a sequência HTTP em conflito de revisão, resposta perdida e acesso revogado em sessão independente, preservando texto local e campos editáveis.

### ARQ-07 · Separar a apresentação do diálogo de matrícula em lote

**Evidência.** O diálogo integra fases, progresso, rascunho, execuções e ações de confirmação com a representação de entrada, revisão e resultado. `enrollment-batch.ts` já contém o parser, resumos, workers e coordenação das operações. [Diálogo](src/features/students/components/batch-enrollment-dialog.tsx#L28) · [Regras do lote](src/features/students/enrollment-batch.ts) · [Teste HTTP](tests/http-enrollment-batch.test.mjs)

- [ ] Extrair a apresentação da revisão e do resultado para componentes privados da feature `students`. Manter no diálogo a máquina de estados atual, os handlers de formulário, o ciclo de montagem e desmontagem, a chave `students-fields`, abortos, invalidação e integração com `StudentsPage`. Reutilizar `enrollment-batch.ts` para parse, seleção, estados e comandos.
- [ ] Preservar o limite de concorrência da prévia, a confirmação sequencial, IDs e chaves de idempotência, cancelamento e repetição somente dos itens pertinentes. No navegador em `/alunos`, testar prévia, seleção, confirmação, falha parcial, repetição, recarga, troca de turma e expiração de sessão. Comparar foco, teclado, progresso, textos e chamadas HTTP, incluindo que uma confirmação ambígua conserva a mesma chave. [Testes de lote](tests/enrollment-batch.test.ts)

### ARQ-08 · Isolar as operações de tentativa no mock HTTP

**Evidência.** `createAssessmentService` registra autoria/publicação e tentativas na mesma factory. `question-service.mjs` importa dali o predicado de prática bloqueada por tentativa autorizada. Alterar regras de tentativa exige separar mentalmente essas dependências dos handlers de autoria. [Serviço atual](server/assessment-service.mjs#L358) · [Operações de tentativa](server/assessment-service.mjs#L519) · [Consumidor da regra de prática](server/question-service.mjs#L2)

- [ ] Separar registro, projeções e operações de tentativa em `server/attempt-service.mjs`, mantendo `createAssessmentService` e o contrato `resolve(path)` usado por `createApp`. Colocar o predicado de prática junto da política de tentativa e atualizar `question-service.mjs` para importá-lo desse destino. Compartilhar apenas guardas de contexto com as mesmas invariantes. Preservar a ordem dos validadores, os callbacks de revisão, autorização, projeção e repetição transacional. O gateway Kotlin fica fora do escopo desse lote.
- [ ] Comparar os métodos, resolução de caminhos, precedência dos erros e resultados antes/depois para autoria, tentativa e prática. Usar o processo real do JSON Server com massa e diretório isolados. Cobrir usuário autorizado e usuário negado, revogação entre etapas, revisão concorrente, reenvio com mesma chave, página vazia, resultado e ausência de gabarito nas projeções protegidas. [Contratos no processo real](tests/http-real-process-contract.test.mjs) · [Questões](tests/http-questions.test.mjs)

### ARQ-09 · Alinhar a documentação operacional ao gateway padrão

**Evidência.** A introdução de `AGENTS.md` descreve o JSON Server como API institucional. O backlog histórico da migração traz comandos anteriores à integração. O default de `http-client.ts`, `package.json`, guia de operação e testes dos comandos confirmam gateway em `3002` e mock opt-in em `3102`. [Orientações do repositório](AGENTS.md#L5) · [Mudança de integração](docs/http/validation-INT-05.md) · [Scripts](package.json) · [Testes dos comandos](tests/dev-entrypoints.test.mjs)

- [ ] Identificar as instruções vigentes de execução e atualizar a documentação operacional que diverge delas. Manter os registros históricos datados com rótulo de contexto e apontar para o guia vigente. Atualizar os trechos correspondentes de `AGENTS.md` se a execução autorizar editar as convenções do repositório.
- [ ] Corrigir a duplicidade de classificação de `aja-notice-draft:*` no inventário. O compositor ativo usa `readDraft` e `useHttpEditor` sobre a memória do cliente de sessão. Documentar o mecanismo ativo e manter a chave histórica entre os dados preservados do navegador. [Inventário](docs/http/storage-inventory.md#L5) · [Compositor](src/features/announcements/components/announcement-composer.tsx#L27) · [Sessão](src/providers/session-client.ts#L123)
- [ ] Conferir `dev`, `dev:full`, `dev:mock`, `api`, `preview`, portas, URL incorporada no build e separação do diretório mutável do mock. Conferir links, exemplos e testes de comandos. Entrega apenas documental, preservando contrato, aplicação e procedimentos de validação.

## Decisões de escopo

- As projeções de estudante, equipe e persistência representam ciclos de vida e permissões distintos. Exemplos são gabarito e explicação em tentativas, histórico de devolutivas e `SubjectSummary` em relação ao registro persistido `Subject`. Tipos com a mesma forma parcial só compartilham uma definição quando consultam o mesmo contrato.
- Fórum e questões têm dropdowns com base visual parecida. Metadados, contagens, filtragem e comportamento de foco são diferentes do `Select` genérico. A auditoria comparou os três e deixa a composição atual neste backlog. [Fórum](src/features/forum/components/forum-filters.tsx#L9) · [Questões](src/features/questions/components/question-filters.tsx#L31) · [Select](src/components/ui/select.tsx)
- `study-order.ts` e `announcement-draft.ts` têm testes e nenhum consumidor ativo encontrado. Permanecem para triagem histórica. O registro de recuperação atual dos avisos usa o provider de sessão. O trabalho em ARQ-02 preserva a cobertura do legado sem assumir equivalência entre essas representações.
- As rotas atuais já compõem as entradas públicas de features e a exportação estática depende de seus limites de Suspense. A auditoria preserva a estrutura dessas entradas. A organização interna do repositório Kotlin e mudanças de produto seguem seus próprios escopos.

## Evidência e fechamento de cada issue

1. Registrar HEAD, caminhos e consumidores afetados, comandos, limitações da massa e evidência anterior à alteração. Usar Graphify antes de investigar fontes e atualizar o grafo após código. Comparar antes/depois para refatoração pura. Para mudanças em verificadores, guardar a falha esperada e a execução verde do mesmo teste. Incluir os testes novos na lista explícita do npm quando forem novos arquivos da suíte.
2. Executar `npm test`, `npm run typecheck`, `npm run check:architecture`, `npm run build` e `npm run check:export` para issues com código. Registrar build padrão e fallback Webpack separadamente, quando houver. Na issue documental, conferir referências, comandos e afirmações contra as fontes, com revisão independente.
3. Seguir `VALIDACAO.md` para as jornadas afetadas. Guardar scripts e logs com dados fictícios e sem credenciais. Comparar DOM após carregamento, status e efeitos HTTP, recarga, falha real, nomes acessíveis, foco e viewports pertinentes. Usar o gateway para a integração do produto e o processo JSON Server para verificar o mock. Em fluxos de edição compartilhada usar sessões independentes para provar revogação, revisões obsoletas e concorrência quando aplicável.
4. Obter as revisões independentes ECC e Ponytail conforme `AGENTS.md`, revalidar correções e registrar os resultados e limites. Fechar somente após aceite comprovado e fazer o commit local coeso com `Refs: ARQ-NN`. Falta de evidência obrigatória mantém a issue aberta.

## Cobertura desta preparação

O inventário Git enumerou 419 caminhos. A análise de imports com o TypeScript do projeto percorreu 275 módulos, sendo 193 em `src/`, 23 em `server/`, 5 em `scripts/` e 54 em `tests/`. Os 53 arquivos `*.test.*` estão listados em `npm test`. A tabela registra a profundidade da análise por grupo. As referências das issues apontam as fontes dos achados.

| Caminhos | Status e profundidade | Issues |
| --- | --- | --- |
| `src/app/`, `src/components/`, `src/hooks/`, `src/providers/` | Imports analisados em todos os módulos. Entradas, Suspense, órfãos, composição e sessão examinados onde afetam os achados. | ARQ-01–03, ARQ-06–07 |
| `src/features/`, `src/lib/`, `src/models/` | Imports analisados em todos os módulos. Comparados envelopes e coletores HTTP, projeções de disciplinas, variantes de tentativa e entrega, regras legadas e dropdowns. | ARQ-02, ARQ-04–07 |
| `server/`, `scripts/`, `tests/` | Imports analisados nos módulos. Revistos os consumidores do legado, os pontos de entrada do mock, os verificadores e os testes das jornadas propostas. | ARQ-01–05, ARQ-08–09 |
| `AGENTS.md`, `ARQUITETURA.md`, `VALIDACAO.md`, `README.md`, backlogs existentes, `docs/` e configurações versionadas | Fontes vigentes de contrato, arquitetura e operação consultadas por assunto. Evidências históricas ficam como referência para o baseline de cada issue. | ARQ-01–09 |
| Assets estáticos, anexos e dados de fixture, lockfile e saídas locais de build/Graphify | Fora da auditoria estrutural de código. Origem, segurança de importação e publicação entram nos aceites aplicáveis. | ARQ-01–03 |

Na revisão base, `npm.cmd test` passou com 391 testes e `npm.cmd run check:architecture` passou com 193 módulos. A preparação foi documental. Typecheck, build, checagem do export e execução no navegador ficam para a linha de base e o aceite das issues que os exigem. A análise transversal cobre imports e os grupos citados, com leitura dirigida dos caminhos que sustentam cada achado.
