# AJA-10 — atividades e autoria

**Início:** `a7ff570aec472a026bae264d8a7a12e318355707`

**Escopo:** lista e detalhe de atividades, criação/edição/publicação de quiz e trabalho, snapshots de questões e resumos na disciplina. AJA-11/12 continuam fora desta entrega.

## Critérios cobertos

- A equipe autorizada salva, reabre, edita e publica; lista, detalhe e filtros usam a API. Links e resumos de atividades publicadas aparecem em `SubjectDetails` pela entrada pública da feature.
- A ordem mista de questões é preservada. Questão de banco já vinculada conserva o snapshot; nova inclusão captura o acervo atual. Autoral pertence à própria atividade, não entra no banco. Gabarito e explicação ficam apenas nos DTOs de equipe autorizada.
- Primeira entrega bloqueia modalidade, nota máxima, módulo, obrigatoriedade, política de atraso, presença/hora do prazo e composição. Título, orientações e data civil de prazo existente podem mudar; hora, segundos e milissegundos de Brasília não mudam. Alteração de composição antes da primeira entrega exige confirmação, reinicia apenas rascunhos não entregues e preserva entregas confirmadas.
- A equipe pode consultar imagem capturada em atividade visível mesmo depois da retirada da questão do banco. Leitura direta da questão retirada e leitura por ator sem acesso ao snapshot permanecem negadas.
- `/questionarios` e `/questionarios/criar` foram habilitadas. Responder e resultado continuam bloqueados e não montam o transporte legado; envio de tentativa, entrega de trabalho e feedback não foram implementados.

## RED/GREEN e correções dos cenários

- `node --experimental-strip-types --test tests/http-assessments.test.mjs`: antes do serviço, quatro cenários de endpoint de atividade recebiam 404 por rota ausente. Com o serviço, os comandos de lista, detalhe, criação, edição e publicação passam contra HTTP real.
- `node --experimental-strip-types --test tests/assessments-client.test.ts`: o primeiro RED não resolvia `src/features/assessments/api.ts`. Depois da implementação, adaptadores, cercas de sessão, paginação e serialização de prazo passam.
- `node --experimental-strip-types --test tests/http-route-gate.test.ts`: o primeiro RED observou que `/questionarios` não estava na allowlist (`false !== true`). GREEN habilita lista/construtor e conserva responder/resultado fechados.
- `first delivery allows metadata and deadline date with the full unchanged seeded composition`: o formulário completo retornava 409 embora composição e estrutura não tivessem mudado. Canonização removeu apenas metadados internos da comparação; o PATCH completo retorna 200 e mantém os snapshots e a entrega.
- `first submitted delivery locks structural fields but permits existing deadline edits and preserves failed writes`: tentativa de alterar somente segundos/milissegundos recebeu 200, embora devesse ser recusada. Comparação passou a usar `HH:mm:ss.SSS` em `America/Sao_Paulo`; mudança do instante dentro da mesma hora retorna 409.
- `assessment image snapshots remain readable after bank retirement only in an authorized visible activity`: reprodução anterior retornava 404 para o arquivo histórico. A projeção agora autoriza a imagem somente pelo snapshot de atividade ainda visível; a questão retirada no banco, atividade não atribuída e escopo de aluno sem acesso continuam 404.
- `recovered title, instructions and deadline save without changing submitted structure or answers` e `recovering current structure does not acknowledge a stale revision or bypass revoked access` cobrem a adoção explícita da estrutura atual depois que chega a primeira entrega durante a edição. A UI exige consulta e adoção; preserva texto local e revisão até essa ação explícita.
- Duas falhas intermediárias eram do cenário/assertions, não bugs: um fixture tentou escrever como docente sem atribuição (403 correto); outro esperava salvar uma estrutura que de fato diferia após a primeira entrega (409 correto). Os fixtures/assertions foram alinhados ao ator autorizado e ao snapshot atual. A imutabilidade e a negação não foram enfraquecidas.

## Verificação final

- `npm.cmd test` — **271/271 passaram** (`tmp/aja10-tests-final.log`).
- `npm.cmd run typecheck` — passou (`tmp/aja10-typecheck-final.log`).
- `npm.cmd run check:architecture` — passou, 178 módulos, sem ciclos (`tmp/aja10-architecture-final.log`).
- `tmp/http-contract-venv/Scripts/python.exe -m openapi_spec_validator docs/http/openapi.json` — passou (`tmp/aja10-openapi-final.log`).
- `tmp/http-contract-venv/Scripts/python.exe tmp/validate-http-examples.py` — 830 exemplos validados, zero erros (`tmp/aja10-examples-final.log`). AJA-09 validou 839 exemplos com o mesmo script. AJA-10 retirou a operação preliminar fora de escopo `POST /assessments/{id}/withdraw` e expandiu exemplos existentes; os cinco comandos previstos para esta fatia permanecem. Os números são exemplos validados, não contagem de chaves JSON.
- `npm.cmd run build` padrão — Turbopack passou; exportou 24 rotas estáticas, incluindo lista e construtor (`tmp/aja10-build-final.log`). Durante o build, `Get-NetTCPConnection` mostrou apenas o preview estático 3001; não havia listener de dev 3000 nem API 3002. Build Webpack alternativo não foi necessário.
- `graphify update .` — atualizado para 1.220 nós e 4.299 arestas; artefatos locais permanecem ignorados.
- `git diff --check` — passou para arquivos rastreados. Os arquivos novos foram inspecionados na conferência final do diff.

## Navegador com API real

- No preview estático de `out/` em `http://127.0.0.1:3001`, docente A criou rascunho, reabriu, publicou e recarregou lista/detalhe; a disciplina exibiu o estado publicado. Questão `q2` foi retirada depois de capturada: o banco retornou 404, enquanto imagem do snapshot continuou 200 para equipe autorizada.
- Primeira entrega concorrente: abri `quiz-open`, alterei título/data e movi questão; fixture isolada registrou a primeira entrega enquanto o editor permanecia aberto. O PATCH completo respondeu conflito, exibiu consulta da estrutura e bloqueou controles estruturais. Depois da consulta e adoção explícitas, título/data locais foram preservados; salvar o formulário completo redirecionou à lista e reload/reabertura manteve valores, estrutura bloqueada e entrega.
- Falha/repetição: com a rede do navegador offline antes do envio, salvar rascunho mostrou indisponibilidade e congelou conteúdo/chave da mesma intenção. Restaurada a rede, “Tentar novamente a mesma operação” criou um único rascunho. Isso valida falha anterior ao commit; não representa uma resposta perdida depois de commit. Repetição/idempotência, estado atual e revogação são cobertos nos testes HTTP.
- Sessões separadas `aja10-admin` e `aja10-student`: administração acessou a lista; aluno viu somente publicadas e detalhe resumido sem enunciados, alternativas corretas ou explicações. `/questionarios/responder` permaneceu indisponível para o aluno. Depois da publicação, o mesmo aluno passou a ver a atividade nova na lista e no resumo de `Materiais e atividades` da disciplina.
- Larguras 390×768, 768×900 e 1440×900: `document.documentElement.scrollWidth` igual à largura da janela. Diálogo de revisão abriu com foco em “Fechar janela”; Tab percorreu controles; fechá-lo por Escape e pelo botão, aguardadas duas animações, devolveu foco a “Salvar alterações”. A primeira amostragem antes das animações via `requestAnimationFrame` observou BODY cedo demais e foi corrigida no procedimento de QA, sem mudança de produto.

Evidências pós-carregamento: `.playwright-cli/page-2026-11-02T22-17-50-713Z.yml` (estrutura consultada), `.playwright-cli/page-2026-11-02T22-18-20-695Z.yml` (lista após o save permitido), `.playwright-cli/page-2026-11-02T22-22-02-463Z.yml` (falha offline), `.playwright-cli/page-2026-11-02T22-22-14-551Z.yml` (repetição), `.playwright-cli/page-2026-11-02T22-32-14-062Z.yml` (rascunho reaberto), `.playwright-cli/page-2026-11-02T22-32-19-384Z.yml` (revisão de publicação) e `.playwright-cli/page-2026-11-02T22-32-25-253Z.yml` (lista após publicação). Os arquivos `tmp/aja10-browser-reopen-proof.log`, `tmp/aja10-browser-teacher-published-list.log`, `tmp/aja10-browser-student-list-loaded.log`, `tmp/aja10-browser-student-detail-loaded.log`, `tmp/aja10-browser-student-subject-after-publish.log`, `tmp/aja10-browser-student-after-publish.log` e `tmp/aja10-browser-admin-list-loaded.log` guardam asserções DOM pós-loader e respostas HTTP observadas (incluindo GET/POST publish 200). Navegações que ainda mostravam “Carregando conteúdo” não são citadas como prova final. Sessões e arquivos de QA são locais.

## Limites e revisão

Os fluxos de tentativa, envio de trabalho e resultado/feedback permanecem para AJA-11/12; esta validação não simula esses endpoints por atalhos de produto. Não houve teste em aparelho físico, conta de aluno externo ou navegador adicional. O mesmo revisor Sol independente conferiu o diff completo desde `a7ff570`, incluindo arquivos novos, correções, contrato/OpenAPI 1.0.8, logs finais e evidências pós-carregamento corrigidas: **APPROVE**, sem achados pendentes. A coordenação conferiu as evidências e encerrou a AJA-10. O backlog também remove a indicação antiga de revisão pendente da AJA-09, já concluída em `a7ff570`.
