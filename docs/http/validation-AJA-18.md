# AJA-18 — validacao integrada e roteiro de operacao

## Baseline, aceite e pontos de entrada

- Revisao inicial: `b0b4a3ab2aa7007f6c074f6c6b07409b282e6445` (`refactor(migration): remove legacy client runtime`), branch `feat/frontend-http`; checkout iniciado limpo.
- Aceite: instalacao limpa, massa local e API real; exportacao estatica com URL publica configurada antes do build; segunda sessao sem armazenamento anterior; contratos contra processos JSON Server reais e repetiveis em outra URL; jornadas admin/docente/aluno, recuperacao, frequencia, calendario, forum e revogacao; falhas controladas sem sucesso falso; matriz por rota/operacao/papel com rede, recarga, copia PT-BR, teclado/foco e larguras 390/768/1440 px.
- Entradas: AJA-18 em `ISSUES-FRONTEND-HTTP.md`; `docs/http/route-matrix.md`, `openapi.json`, `contract.md`, `operator.md`, `.env.example`, `VALIDACAO.md`; server/config/seed e scripts dev/preview; fronteira browser HTTP em `src/lib/http-client.ts` e `src/providers/app-context.ts`.
- Restricoes: manter exportacao estatica e chamadas autenticadas no browser; nao ler/resetar dados persistentes do operador; usar massa ficticia isolada; sucesso somente de respostas HTTP reais; cookies/CORS para a origem do site.
- Navegacao: `.agents/skills/arquiteto-nextjs/SKILL.md` e guia Next 16 `node_modules/next/dist/docs/01-app/02-guides/static-exports.md` lidos. Sem cookies no servidor, Server Actions ou handlers dinamicos na exportacao. ECC 2.2.3 TDD, verification-loop e code-reviewer lidos. Graphify consultado antes das leituras de codigo.
- Runner real: `node --experimental-strip-types --test` no script `npm test`; `dev:full`, `api`, `preview`, `typecheck`, `check:architecture`, `check:export` no package.json.

## Procedimento reproduzivel

Massa local isolada; estes comandos nao resetam o runtime do operador.

```powershell
npm.cmd ci
$env:API_PORT='3203'
$env:API_ALLOWED_ORIGINS='http://127.0.0.1:3001'
$env:API_FRONTEND_ORIGIN='http://127.0.0.1:3001'
$env:API_COOKIE_SECURE='false'
$env:AJA_TEST_RUNTIME="$env:TEMP\aja18-validation-runtime"
$env:NODE_ENV='test'
npm.cmd run api

# Em outro terminal, antes do build:
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:3203/api/v1'
npm.cmd run build
npm.cmd run preview
```

A API de preview permite exatamente `http://127.0.0.1:3001`. O runtime `AJA_TEST_RUNTIME` somente pode ser usado com `NODE_ENV=test`; use uma pasta descartavel do operador e o mesmo valor em todos os processos que leiam a caixa de recuperacao. O script `password-recovery-browser.ps1` exige `AJA_TEST_RUNTIME` e le `db.json` desse runtime; nao codifica um diretorio proprio. O cookie `aja_session` usa `HttpOnly; Path=/api/v1; SameSite=Lax`; com portas diferentes no mesmo host o browser envia credenciais por `credentials: include`. HTTPS ativa `Secure`. Hospedagem cross-site exige desenho de cookie separado. `NEXT_PUBLIC_API_URL` fica incorporada ao JS no build e deve ser configurada antes dele.

RED/GREEN do procedimento: configurando `AJA_TEST_RUNTIME` sem `NODE_ENV=test` e executando `npm.cmd run api` encerrou com `Runtime isolado disponivel somente em testes.`; mantendo as mesmas variaveis e definindo `NODE_ENV=test`, o processo iniciou em `http://127.0.0.1:3203`. O teste usa um runtime isolado novo; nao modifica o banco persistente do operador.

## RED/GREEN e correcoes do harness

| Caso | RED/observacao | GREEN |
| --- | --- | --- |
| PATCH de feedback | O harness enviou `Idempotency-Key` fora do OpenAPI para `PATCH /submissions/{id}/feedback`; a API respondeu 500 com campos estritos. | Removido o header nao contratado; `expectedRevision/comment/grade` real respondeu 200. A chave fica no `POST /publish-feedback`, conforme contrato. Nenhum defeito de produto foi confirmado. |
| Criar atividade | Primeira chamada sem `Idempotency-Key` recebeu 422, conforme contrato. | Harness corrigido para enviar chave no POST; criacao/publicacao responderam 201/200. |
| Recuperacao | Primeira tentativa Playwright nao tinha `process.env`; token mais recente estava consumido e recebeu 422 (digest conferido internamente, sem exibir valor). | Solicitacao nova pela UI, token de uso unico passado temporariamente ao script auxiliar, reset 200 e login com nova senha 200. Repetir o mesmo token pela UI recebeu HTTP 422 e mensagem `Token invalido ou ja utilizado.`. Token redigido nos logs e removido da pasta TEMP apos uso. |
| Matrix de processo | REDs do harness: caminho de matricula inventado retornou 404; conjuntos parciais de elegiveis retornaram 409; PATCH de progresso com `completed:false` recebeu 422; consulta por material apos encerrar matricula recebeu 404; Idempotency-Key inventada no PATCH de respostas causou 500; a ativacao de e-pending com matricula ja ativa recebeu 409. | Corrigidos IDs/rotas conforme fixture; frequencia usa a lista integral de `/attendance/eligible`; progresso marca `completed:true`, leitura da segunda conta consulta so colecao acessivel e o helper envia Idempotency-Key somente em POSTs contratados. Ativacao usa runtime de teste isolado com o registro legado `e-pending` no estado valido de pendencia/e-mail confirmado; a chamada continua passando pelo JSON Server. Suite externa GREEN em dois processos, 98/98 operacoes e 35 GETs pos-escrita registrados. |

## Resultados reproduzidos

- `npm.cmd ci --no-audit --no-fund`: passou; 164 pacotes instalados. npm reportou 1 vulnerabilidade critica e `connect-pause` depreciado; registrado para triagem sem alteracao incidental de dependencias.
- `node --experimental-strip-types --test tests/http-real-process-contract.test.mjs`: 1/1 passou. O mesmo conjunto de 98 operacoes e papeis iniciou dois processos JSON Server independentes em URLs/portas efemeras, com runtimes temporarios diferentes. Resultado por operacao, papel, reload e negacao em `http-process-read-matrix.log`; sem token/cookie nos logs.
- Preview em `127.0.0.1:3001`, API real em `127.0.0.1:3203`: contextos sem storage anterior; admin inclui aluno (201) e atribui docente (200); docente envia PDF (201) e publica material (201), cria/publica atividade (201/200); aluno abre material/atividade, envia trabalho (201/200), recarrega e continua vendo atividade; docente publica feedback e aluno o le (200). Recuperacao UI 202, reset 200, login com senha redefinida 200. DOM e status reais estao nos logs.
- Smoke das 22 rotas estaticas: cada rota abriu/recarregou em 390, 768 e 1440 px, com HTTP 200, `main h1`, foco de teclado visivel apos Tab e sem overflow horizontal (66 combinacoes rota/largura). Evidencia em `route-matrix-width-reload-keyboard.log`; contexts autenticados separados admin/docente/aluno e anonimos. Este smoke nao injeta indisponibilidade de API e nao exercita cada operacao de escrita.
- Indisponibilidade autenticada: `route-matrix-network-width-browser.js` abortou requests reais da API em 19 rotas protegidas x 3 larguras (57/57 PASS). Cada caso manteve HTTP 200 estatico, mostrou retry PT-BR antes/depois de reload, recebeu foco visivel apos Tab e nao teve overflow. Login, cadastro e recuperacao passaram como controles em 390 px. Logs: `route-matrix-network-width-browser.log`.
- Matriz browser rota/persona: seis lotes Playwright verificaram 133 pares de rota e persona e 399 combinacoes de viewport (390/768/1440). Cada linha registra status real da API, DOM permitido/negado, reload, Tab/foco e overflow; offline registra erro/retry para permissoes permitidas ou N/A somente quando o probe real retornou 401/403/404 e a mesma pagina permaneceu negada sem request. As telas publicas tiveram 9/9 falhas de envio pela UI, com POST abortado, erro visivel, valores preservados e foco. Tabela detalhada: `evidence/AJA-18/route-role-coverage-AJA-18.md`; logs JSON validos: `route-role-browser-batch-01-final.log` a `route-role-browser-batch-06-final.log`.
- Defeito confirmado no detalhe do topico: antes da correcao, `GET /topics/topic1` indisponivel levava ao estado `Pergunta indisponivel`, sem acao de nova tentativa; o DOM excedia a largura em 1440 px. `ForumThread` agora usa `ErrorState` com `query.retry` para erros de rede e mantem o estado vazio para recurso ausente. O script RED/GREEN reproduziu a falha e confirmou retry/foco/sem overflow nas tres larguras depois da correcao. Nao houve resposta de sucesso fabricada.
- Falhas reais/controladas: duas sessoes docentes editaram a mesma revisao; primeiro PATCH 200, stale PATCH 409 e leitura confirmou valor duravel. Chamada invalida recebeu 422. Timeout injetado foi `TimeoutError` sem resposta HTTP. Upload abortado no transporte foi `TypeError` sem resposta HTTP. Os ultimos dois sao falhas de rede, nao status HTTP. Nenhum sucesso foi interceptado ou fabricado.
- Teclado/foco: foco inicial do dialogo, Tab ao campo, Escape, confirmacao para fechar e retorno ao disparador passaram; aviso de privacidade anonimo fecha por Escape e restaura foco. Larguras 390/768/1440 sem overflow.
- `npm run build`: passou em Next 16.3.8 Turbopack com 24 artefatos. Sem fallback Webpack. `npm run check:export`: passou, 151 arquivos estaticos.

Scripts/logs: `docs/http/evidence/AJA-18/`. Token e cookies nao persistidos; logs Playwright redigem credenciais ficticias como `[LOCAL_TEST_PASSWORD]`. Contas/detalhes de operador ficam em `docs/http/operator.md`.

## Matriz por rota, operacao e papel

`docs/http/route-matrix.md` e a referencia detalhada para metodos HTTP permitidos/negados. Esta validacao separa chamadas reais por metodo/papel no processo JSON Server das verificacoes browser por rota/persona. Testes herdados de issues anteriores nao contam como reexecucao AJA-18.

| # | Rota | Papel permitido / negacao relevante | Operacao principal | Resultado integrado AJA-18 |
| --- | --- | --- | --- | --- |
| 1 | `/login` | Publico; A/D/G autenticam | login/session | UI 200; tres contas reais autenticaram 200. |
| 2 | `/cadastro` | Publico | register/confirmacao | UI 200; mutacoes cobertas por AJA-05. |
| 3 | `/recuperar-senha` | Publico | pedido/reset token | UI 202, reset 200, login posterior 200; token redigido. |
| 4 | `/perfil` | A/D/G; somente o proprio perfil | me/profile/enrollments | Rota carregada em AJA-05/06; GETs reais durante login. |
| 5 | `/usuarios` | G; aluno/docente sem acesso | users CRUD/role/withdraw/deactivate | Admin abriu; contrato real confirmou escopo/negacao. |
| 6 | `/turmas` | G | classes CRUD/close/reopen | Admin abriu e viu turma; comandos AJA-06. |
| 7 | `/alunos?turma=c1` | G | students/enrollment/preview/cancel/end | Admin abriu; inclusao na jornada 201. |
| 8 | `/alunos/perfil?id=student` | G | student/attendance history | Admin abriu perfil com DOM carregado. |
| 9 | `/disciplinas?turma=c1` | A/D/G segundo atribuicao | subjects/visits/team | Admin abriu; atribuicao docente 200. |
| 10 | `/disciplinas/detalhes?id=s1` | A/D/G atribuido; docente sem atribuicao negado | subjects/modules/materials/activity | Docente publicou; contrato real testa negacao 403/404. |
| 11 | `/materiais?id=material-text` | A/D/G autorizado | material/file/progress | Aluno viu material; reload do fluxo preservou atividade. |
| 12 | `/questoes?id=q1` | A/D/G no escopo | questions/practice | Rota carregada para aluno; mutacoes AJA-09. |
| 13 | `/questionarios` | A/D/G autorizado | assessments/attempts/submissions | Atividade integrada criada e visivel ao aluno. |
| 14 | `/questionarios/criar?id=quiz-draft` | D atribuido/G | create/edit/publish | Criacao/publicacao docente 201/200. |
| 15 | `/questionarios/responder?id=quiz-open` | A com matricula; equipe para entregas | attempts/submissions/feedback/files | Aluno entregou 201/200, leu feedback 200. |
| 16 | `/questionarios/resultado?id=attempt-sent` | A proprio/equipe autorizada | attempt result | Rota carregada; contratos AJA-11. |
| 17 | `/avisos` | A/D/G conforme visibilidade | announcements CRUD/withdraw | Rota carregada; comandos AJA-13. |
| 18 | `/calendario` | A/D/G | calendar range | AJA-18: teacher criou aviso na UI (POST 201); student abriu evento do calendário (GET 200), conferiu data/horário e link de origem no DOM. `calendar-forum-browser-final.log`. |
| 19 | `/forum?...` | A/D/G autenticado | topics/files | AJA-18: student criou pergunta (POST 201), reload confirmou; teacher respondeu (POST 201), reload confirmou pergunta, resposta e autores no DOM. `calendar-forum-browser-final.log`. |
| 20 | `/forum/topico?id=topic1` | A/D/G; acoes segundo autoria/permissao | read/reply/vote/solution/withdraw | Rota carregada; teclado e 3 larguras registrados. |
| 21 | `/frequencia?disciplina=s1` | D atribuido/G; aluno negado | attendance/eligible/create/edit | AJA-18 UI atualiza chamada existente por PATCH 200, stale PATCH 409/reload e teacher sem atribuicao GET 404 (`attendance-ui-browser.log`). POST 201 foi exercitado no contrato de processo; nao afirmar POST pela UI. Aluno recebe mensagem PT-BR e GET 403. |
| 22 | `/` | A/D/G, dados proprios | dashboard | Painel real do aluno carregou. |

Limite explicito: 50/98 metodos tiveram request UI nesta execucao. As 48 variantes sem acao UI individual tem chamadas reais de processo por papel aplicavel e evidencia browser da rota/persona correspondente; nao se afirma que cada variante foi clicada. A matriz browser fechou 133/133 pares e 399/399 larguras.

### Operacoes por rota, metodos e papeis

Abreviacoes: P publico anonimo; A aluno com matricula vigente; D docente atribuido; G administrador. `Negacao` refere-se a perfis fora do escopo e regras de identidade/revisao conforme AJA-01. O crosswalk `evidence/AJA-18/operation-role-coverage-AJA-18.md` registra resultado por metodo/papel em processo real; `evidence/AJA-18/route-role-coverage-AJA-18.md` registra resultado browser por rota/persona/largura. Requisicoes de operacao via UI sao indicadas separadamente e nao se inferem do carregamento da pagina.

| Rota | Perfil permitido / negado | Todos os metodos e caminhos do contrato | Evidencia executada / limite |
| --- | --- | --- | --- |
| `/login` | P entra; A/D/G restauram sua propria sessao; demais nao leem dados privados (401) | `POST /auth/login`; `GET /auth/session` | AJA-18: tres logins UI 200 e API anonima privada 401 em contrato-process; suite AJA-05. |
| `/cadastro` | P cria aluno e confirma somente proprio token; token alheio/invalido negado | `POST /auth/register`; `POST /auth/email-confirmation-requests`; `POST /auth/email-confirmations` | Suite/validacao AJA-05; smoke DOM P AJA-18. Escritas nao repetidas por UI AJA-18. |
| `/recuperar-senha` | P solicita; token de uso unico altera somente a propria conta; sessao antiga revogada | `POST /auth/password-reset-requests`; `POST /auth/password-resets` | AJA-18: request UI 202, token reset 200 e novo login 200; token redigido. |
| `/perfil` | A/D/G leem; PATCH somente o proprio perfil; A confirma proprio email | `GET /me`; `PATCH /me`; `GET /me/enrollments`; `POST /auth/email-confirmation-requests`; `POST /auth/email-confirmations` | Suite/validacao AJA-05/06; respostas GET nas sessoes AJA-18. Nao repetiu edicao/confirmacao por UI nesta issue. |
| `/usuarios` | G CRUD; A/D nao leem nem escrevem usuarios administrativos (403) | `GET,POST /users`; `GET,PATCH /users/{id}`; `POST /users/{id}/withdraw`; `POST /users/{id}/role`; `POST /users/{id}/deactivate` | Suite/validacao AJA-06; AJA-18 real: admin lista 200, aluno negado 403. CRUD nao repetido em UI AJA-18. |
| `/turmas` | G administra; A/D nao executam comandos de turma | `GET,POST /classes`; `GET,PATCH /classes/{id}`; `POST /classes/{id}/close`; `POST /classes/{id}/reopen` | Suite/validacao AJA-06; AJA-18 route smoke como G. Escritas nao repetidas em UI AJA-18. |
| `/alunos?turma=…` | G inclui/cancela/encerra; equipe consulta escopo; aluno nao administra matriculas | `GET /students`; `GET /enrollments`; `GET /enrollments/preview`; `GET /enrollments/{id}`; `GET /classes`; `POST /enrollments`; `POST /enrollments/{id}/cancel`; `POST /enrollments/{id}/end` | Suite/validacao AJA-06/15/16; jornada UI admin→aluno POST 201 em AJA-18. Variantes de cancelamento/historico nao repetidas no browser. |
| `/alunos/perfil?id=…` | G/equipe autorizada; estudante/docente fora do contexto nao le perfil arbitrario | `GET /students/{id}`; `GET /attendance?studentId=…` | Suite/validacao AJA-06/15/16; AJA-18 smoke UI G. Operacoes nao repetidas em UI nesta issue. |
| `/disciplinas?turma=…` | A/D/G filtrados por matricula/atribuicao; criar/atribuir equipe so G | `GET,POST /subjects`; `PATCH /subjects/{id}`; `GET /users?role=teacher`; `GET /subjects/{id}/visits` | Suite/validacao AJA-07; AJA-18 atribui docente 200 e contrato-process valida leituras/denegacao. Criacao completa nao repetida na UI. |
| `/disciplinas/detalhes?id=…` | A/D atribuido/G le; D atribuido/G escreve; docente sem atribuicao negado | `GET /subjects/{id}`; `GET /modules?subjectId=…`; `GET,POST /subjects/{id}/visits`; `POST /modules`; `GET,PATCH /modules/{id}`; `POST /subjects/{id}/reorder-modules`; `GET /materials?subjectId=…`; `POST /materials/batch`; `PATCH /materials/{id}`; `POST /modules/{id}/reorder-materials`; `GET /assessments?subjectId=…`; `GET /announcements?subjectId=…` | Suite/validacao AJA-07/08/10/13; AJA-18 publica material e atividade com chamadas reais; conflito de modulo 200/409; atribuicao revogada leva PATCH a 403. Nem toda ordenacao repetida em UI. |
| `/materiais?id=…` | A/D/G conforme escopo; progresso pertence ao ator; arquivo sem acesso negado | `GET /materials/{id}`; `GET /files/{id}`; `GET /files/{id}/content`; `GET,PATCH /me/progress` | Suite/validacao AJA-08; AJA-18 upload real 201, aluno abre material e reload. Download/progresso nao repetidos nesta UI. |
| `/questoes?id=…` | A/D/G conforme escopo; construtor so equipe autorizada | `GET /questions`; `GET /questions/{id}`; `POST /questions/{id}/practice` | Suite/validacao AJA-09; smoke UI AJA-18; pratica nao repetida nesta execucao. |
| `/questionarios` | A lista suas atividades; D/G equipe atribuida; projecoes de entrega respeitam ator | `GET /assessments`; `GET /attempts`; `GET /submissions` | Suite/validacao AJA-10/11/12; atividade integrada criada e visivel na jornada AJA-18. |
| `/questionarios/criar?id=…` | D atribuido/G compoe; aluno nao cria/publica | `GET /assessments/{id}`; `GET /questions`; `POST /assessments`; `PATCH /assessments/{id}`; `POST /assessments/{id}/publish` | Suite/validacao AJA-09/10; AJA-18 criacao/publicacao real 201/200 pela UI. Edicao nao repetida nesta UI. |
| `/questionarios/responder?id=…` | A inicia/submete proprio; D/G consulta/submete feedback de equipe atribuida; rascunho privado | `GET /assessments/{id}`; `POST /attempts`; `GET /attempts/{id}`; `PATCH /attempts/{id}/answers`; `POST /attempts/{id}/submit`; `GET,POST /submissions`; `GET,PATCH /submissions/{id}`; `POST /submissions/{id}/submit`; `PATCH /submissions/{id}/feedback`; `POST /submissions/{id}/publish-feedback`; operacoes `/files` | Suite/validacao AJA-11/12; AJA-18 aluno entrega 201/200, equipe grava/publica feedback 200 e aluno recebe projecao. Timeout/upload abortado testados separadamente. |
| `/questionarios/resultado?id=…` | A somente seu resultado; equipe so estudante/atividade autorizados | `GET /attempts/{id}/result` (ID proprio/equipe por `GET /attempts?assessmentId=…`) | Suite/validacao AJA-11; smoke DOM aluno AJA-18; resultado nao repetido no fluxo principal. |
| `/avisos` | A/D/G le publicacoes visiveis; D/G autorizado compoe/edita/retira | `GET,POST /announcements`; `GET,PATCH /announcements/{id}`; `POST /announcements/{id}/withdraw` | Suite/validacao AJA-13; AJA-18 rota com dado real carregada para A/D; comandos nao repetidos nesta UI. |
| `/calendario` | A/D/G somente eventos de seu escopo | `GET /calendar?from=…&to=…` | Suite/validacao AJA-13 e contrato-process AJA-18 200 para aluno; DOM carregado. |
| `/forum?…` | A/D/G autenticado; referencia/arquivo respeitam pai e ator | `GET,POST /topics`; `GET /questions/{id}` ou `GET /materials/{id}`; operacoes `/files` | Suite/validacao AJA-14; AJA-18 rota carregada e contratos-process topics 200; anexos/falhas de upload nos testes dedicados. |
| `/forum/topico?id=…` | A/D/G leitura; resposta/voto/solucao/retirada sob autoria e permissao vigente | `GET /topics/{id}`; `POST /topics/{id}/read`; `POST /topics/{id}/replies`; `POST /topics/{id}/solution`; `POST /topics/{id}/replies/{replyId}/vote`; `POST /topics/{id}/withdraw`; `POST /topics/{id}/replies/{replyId}/withdraw`; operacoes `/files` | GET online 200 para A/D/G em dois processos; offline/retry/foco e 390/768/1440 AJA-18. Cada mutacao nao foi repetida na UI AJA-18. |
| `/frequencia?disciplina=…` | D atribuido/G le/edita; A e docente sem atribuicao negados | `GET /attendance`; `GET /attendance/eligible`; `POST /attendance`; `GET,PATCH /attendance/{id}` | AJA-18 browser: teacher autorizado GET + PATCH 200 de chamada existente, stale PATCH 409, reload; teacher sem atribuicao GET 404; aluno UI negado PT-BR/GET 403; corpo invalido 422 real. POST 201 pertence à matriz de processo contra JSON Server, nao à UI. |
| `/` | A/D/G somente painel proprio e destinos autorizados | `GET /me/dashboard`; destinos repetem seus endpoints com ACL propria | Suite/validacao AJA-16; contrato-process/route smoke AJA-18 com painel do aluno. |

Os metodos e perfis acima transcrevem as linhas de `docs/http/route-matrix.md`. Processo real cobre cada metodo e cada par global de papel permitido/proibido; `operation-role-coverage-AJA-18.md` cruza esses status com a pagina browser correspondente. Ha request UI para 50 metodos; as outras 48 variantes ficam identificadas sem alegacao de clique. O Playwright registrou 133/133 pares rota/persona e 399/399 viewports com status HTTP/DOM, reload, foco e estado offline ou N/A justificado. O teste separado de indisponibilidade cobre 57/57 combinacoes rota/largura. As telas publicas tiveram 9/9 falhas de envio UI. As checkboxes AJA-18 permanecem `[ ]` enquanto aguardam os rechecks independentes.

### Contratos adicionais reexecutados em processos JSON Server

`http-process-read-matrix.log` e gerado pelo teste ao iniciar dois processos com runtimes isolados e URLs diferentes. Ambos receberam o mesmo conjunto: 116 commands com ator/status, 110 GETs de operacao por papel (admin 40, docente 36, aluno 33, publico 1) e 35 GETs de reload; 69 pares unicos de operacao/papel proibido receberam 403/404. Comparacao da matriz de operacoes (98 metodos) com os requests processuais encontrou os 98 metodos exercitados ao menos uma vez, todos os pares `x-roles` positivos exercitados e todos os pares globais proibidos respondendo 403/404 em ambos processos. As escritas permitidas incluem os dois papeis de operacao quando aplicavel (admin/docente), alem dos fluxos de aluno e comandos publicos. A matriz por operacao, papel e status esta em `evidence/AJA-18/operation-role-coverage-AJA-18.md`, regeneravel por `node docs/http/evidence/AJA-18/build-operation-coverage.mjs`.

O gerador `build-operation-coverage.mjs` confirma 98/98 metodos com resultado processual por papel permitido/negado e pagina browser mapeada; zero pares globais faltando. Ha request UI para 50/98 metodos; os outros 48 nao sao descritos como interacao UI. O crosswalk browser contem 133/133 pares PASS e 399/399 viewports; os N/A offline sao apoiados por resposta real de acesso negado e DOM persistente. As telas publicas registram 9/9 falhas de envio. Os 22 caminhos tambem tem smoke de reload/foco em 390/768/1440; o teste separado de rede cobre as 19 rotas protegidas em 57/57 combinacoes. As checkboxes AJA-18 permanecem `[ ]` ate o recheck independente.

## Gates, revisoes e status

- `npm.cmd test`: 364/364 passaram, 0 falhas; duracao 22.69 s. Log final: `evidence/AJA-18/gate-npm-test.log`.
- `npm.cmd run typecheck`: passou (`next typegen && tsc --noEmit`). Log final: `evidence/AJA-18/gate-typecheck.log`.
- `npm.cmd run check:architecture`: passou, 181 modulos, fronteiras preservadas, nenhum ciclo. Log final: `evidence/AJA-18/gate-architecture.log`.
- `NEXT_PUBLIC_API_URL=http://127.0.0.1:3203/api/v1 npm.cmd run build`: passou com Next 16.3.8 Turbopack e 24 rotas estaticas; sem fallback Webpack. Log final: `evidence/AJA-18/gate-build.log`.
- `npm run check:export`: 151 arquivos, sem marcadores de seed/credencial (`gate-export.log`).
- `graphify update .`: executado apos as alteracoes dos scripts/crosswalk. `git diff --check`: passou apos os edits.
- ECC e Ponytail independentes ainda pendentes; issue continua aberta ate as duas revisoes e eventuais rechecks.
