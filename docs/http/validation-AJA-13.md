# AJA-13 · Avisos, mural e calendário

## Escopo

- Revisão inicial: `a4d0f0c`, branch `feat/frontend-http`.
- Entradas: `/avisos`, `/calendario`, mural em `/disciplinas/detalhes?id=...`, compositor compartilhado, projeção de próximos encontros.
- Dependências AJA-07 e AJA-10 já concluídas no início desta issue.
- Persistência e autorização usam a API JSON Server em `/api/v1`; o navegador não baixa a base toda. A tela estática faz chamadas autenticadas no navegador.

## RED / GREEN

- RED do serviço: `node --test tests/http-announcements.test.mjs` falhou 3/3 porque `/announcements` e `/calendar` ainda não estavam registrados; requisições que esperavam criação/negação receberam 404. Registro: `tmp/aja13/red-service.log`.
- GREEN dos contratos HTTP: `npm.cmd test` terminou com 317 testes aprovados, incluindo publicação visível em outra sessão, destinatários e registro local de notificação, datas, revisão concorrente, retirada, evento opcional, dia inteiro, ausência de duplicatas legadas, falha de persistência e replay idempotente sem novo envio.
- A inspeção no navegador encontrou `/avisos` e `/calendario` bloqueados pelo gate do shell. O teste `announcement mural and calendar routes are enabled with their HTTP integration` foi adicionado, falhou antes da inclusão das rotas e passou depois.
- RED/GREEN do estado do cliente: `tests/announcements-client.test.ts` cobre DTO/requests, conflito e preservação do texto na falha, idempotência de retry e ordenação/filtro de encontros próximos.

## Navegador e HTTP real

Roteiro autocontido: [`tmp/aja13/browser-announcements.js`](../../tmp/aja13/browser-announcements.js). Resultado completo: `tmp/aja13/browser-announcements.log`.

Três contextos independentes (`teacher-a`, `student`, `teacher-b`) validaram publicação contextual, acontecimento de dia inteiro para 2026-11-09, aviso e origem após recarregar em outra sessão, conflito 409 com texto local mantido, consulta explícita da versão atual, edição 200, remoção do evento no calendário e retirada 204 refletida no mural do aluno.

O roteiro provocou um único erro 503 na publicação, verificou o rascunho no compositor e então fez retry contra o servidor. Respostas observadas: POST 503 controlado; POST 201 real; GET de avisos/calendário 200; PATCH 200; PATCH 409; retirada POST 204. A resposta 503 foi um erro intencional, e nenhum sucesso foi simulado.

O aviso com notificação ligada gravou solicitações na coleção persistente local `outbox`, uma por aluno autorizado. `tests/http-announcements.test.mjs` lê o estado persistido e verifica os destinatários/links, replay idempotente sem duplicar solicitações, opção desligada sem solicitação e rollback completo se a escrita falha. `tmp/aja13/outbox-local-read.log` registra leitura da base isolada usada na jornada de navegador. A coleção é lida pelo utilitário local de operador `node server/outbox.mjs`; não é exposta por HTTP nem enviada automaticamente. Avisos locais anteriores não são importados.

## Outros contratos e gates

- OpenAPI existente verificado em `tmp/aja13/openapi-check.log`: GET/POST `/announcements`, GET/PATCH `/announcements/{id}`, POST `/announcements/{id}/withdraw`, GET `/calendar` e schemas `Announcement`, `AnnouncementCreate`, `AnnouncementEdit`, `Occurrence` e `CalendarItem` presentes. Nenhum exemplo ou contrato precisou mudar.
- `npm.cmd test`: 317 aprovados, 0 falhas; saída completa em `tmp/aja13/npm-test-final.log`.
- `npm.cmd run typecheck`: aprovado; `tmp/aja13/typecheck-final.log`.
- `npm.cmd run check:architecture`: aprovado (182 módulos, limites preservados, sem ciclos); `tmp/aja13/architecture-final.log`.
- `npm.cmd run build`: aprovado em Next.js 16.3.8/Turbopack; export estático com 24 páginas. Não houve fallback Webpack. `tmp/aja13/build-default-final.log`.
- `graphify update .`: executado após as mudanças.
- Antes da validação, 3000 estava livre e a API de teste isolada escutava em 3002; a prévia estática escutava em 3001. Depois, 3000, 3001 e 3002 ficaram livres. O runtime isolado e os logs/scripts permanecem em `tmp/aja13`.

## Limites para revisão

- `/` segue temporariamente bloqueada pelo shell para a issue de painéis AJA-16. Os componentes de painel consultam a projeção de próximos encontros derivada do calendário HTTP, e a regra é coberta por teste; a renderização do painel não foi exercitada nesta issue.
- A caixa local de solicitações é a outbox durável de operador que já existia. O produto não tem inbox de notificações no cliente, e esta issue não cria uma nem expõe a outbox por HTTP.

## Correções após REQUEST CHANGES de Sol

- **RED/GREEN da chave idempotente:** `tmp/aja13/browser-idempotency-red.log` reproduz POST real 201 seguido de perda da resposta após o commit; ao reabrir o compositor na mesma sessão, o código anterior enviou outra chave e criou outro ID. Com a correção, `tmp/aja13/browser-idempotency-green-final.log` mostra os dois POSTs 201 com o mesmo ID e a mesma chave, rascunho retomado após remount e um único card em `/avisos`. `tmp/aja13/browser-idempotency-outbox-final.log` confirma um aviso e duas solicitações persistidas, uma por aluno autorizado. A chave+fingerprint ficam no extra do rascunho do mesmo contexto e são apagadas ao descartar, sair ou trocar de sessão.
- **RED/GREEN da paginação:** `tmp/aja13/calendar-upcoming-red.log` falha com 100 itens onde esperava 101, ocultando o acontecimento na página 2 atrás de 100 prazos. O teste `calendar upcoming paginates before the dashboard filters to announcements` passa no GREEN em `tmp/aja13/review-fixes-focused-green.log`.
- **RED/GREEN da ordenação:** `tmp/aja13/review-fixes-red.log` esperava `-date` e recebeu a ordem ascendente. O teste HTTP `calendar sorting follows both advertised directions and preserves ascending ID tie-breaks` verifica `date`, `-date` e desempate ID crescente; passou na suíte final.
- **RED/GREEN do CTA:** `tmp/aja13/cta-route-red.log` registra a asserção falhando quando o destino é `/announcements` em vez de `/avisos`. O roteiro `tmp/aja13/browser-idempotency-green.js` comprova que o link administrativo abre a página exportada `/avisos/` e carrega o título “Mural de avisos”.
- **Prazos e notificações:** `calendar includes assigned assessment deadlines and hides unassigned work from students` verifica prazos publicados para estudante atribuído e sua ausência para estudante desatribuído. `notify:false` é verificado usando o URL do mesmo ID de aviso e não grava entrada na outbox; falha de escrita não deixa gravação parcial. A outbox continua somente local/operator-only: não é entrega de e-mail, endpoint HTTP ou inbox/UI.
- **Gates finais do lote:** `npm.cmd test` passou com 322 testes; typecheck passou; arquitetura passou com 183 módulos e sem ciclos; build estático Next.js 16.3.8/Turbopack passou sem fallback Webpack. Saídas: `tmp/aja13/npm-test-review-final.log`, `typecheck-review-final.log`, `architecture-review-final.log` e `build-review-final.log`. `graphify update .` executado depois das mudanças.
- **Navegador final:** `tmp/aja13/browser-announcements-review-final.log` repete a jornada de publicação, 503+retry, outra sessão, calendário após reload, conflito de revisão, remoção de acontecimento e retirada. A evidência de perda real da resposta, remount e CTA fica em `tmp/aja13/browser-idempotency-green-final.log`.

## Recheck: preservacao do publico global

- RED/GREEN: `node --experimental-strip-types --test tests/announcements-client.test.ts`; RED em `tmp/aja13/global-audience-red.log` falhou porque abrir aviso com `subjectId:null` no contexto `s1` produzia `subjectId:'s1'`. GREEN em `tmp/aja13/global-audience-green.log` passou 6/6, cobrindo preservar null ao editar, usar `s1` ao criar contextual, manter disciplina especifica e nao inventar acontecimento.
- Navegador + HTTP real: `tmp/aja13/browser-global-audience.js` e `tmp/aja13/browser-global-audience.log` criam aviso global, abrem a edicao no mural `s1`, verificam o select de disciplina desabilitado sem selecao, fazem PATCH 200 e confirmam no DTO retornado `subjectId:null` e o texto atualizado. O build de export usado esta em `tmp/aja13/build-global-scope.log`.
- A correcao mantem o publico nulo explicito quando existe um aviso em edicao; o contexto do mural so preenche o publico de um novo aviso.
- Revalidacao apos a correcao de escopo: `npm.cmd test` 323/323 (`tmp/aja13/npm-test-global-final.log`), `npm.cmd run typecheck` aprovado (`tmp/aja13/typecheck-global-final.log`), `npm.cmd run check:architecture` aprovado com 184 modulos (`tmp/aja13/architecture-global-final.log`), `npm.cmd run build` aprovado em export estatico Next.js 16.3.8/Turbopack sem fallback Webpack (`tmp/aja13/build-global-final.log`). `graphify update .` concluiu; ports 3000/3001/3002 estavam livres apos os testes. OpenAPI/exemplos nao mudaram nesta correcao.

## Recheck Ponytail: isolamento por classe, acoes por aviso e troca de turma

- **RED/GREEN dos filtros HTTP:** `node --test --test-name-pattern="class-wide announcements are filtered" tests/http-announcements.test.mjs`; RED `tmp/aja13/class-scope-red.log` falha porque aviso class-wide de `c-empty` aparece em `subjectId=s1`. GREEN `tmp/aja13/class-scope-green.log` cobre `/announcements` e `/calendar`: exclui de `s1` e inclui em `s-empty`, ambos em HTTP real contra API isolada.
- **RED/GREEN das acoes do mural:** `node --experimental-strip-types --test --test-name-pattern="class changes clear|mural management controls|editing preserves" tests/announcements-client.test.ts`; RED `tmp/aja13/subject-controls-red.log` reproduz controles para professor em aviso global e disciplina stale; GREEN `tmp/aja13/subject-controls-green.log` cobre professor sem Editar/Retirar no class-wide, professor mantendo acoes no aviso de sua disciplina e admin mantendo operacao global.
- **Terceiro candidato reproduzido antes da correccao:** build com comportamento anterior e `tmp/aja13/browser-class-change-red.js` resultaram em POST real 422 `VALIDATION_ERROR` ao selecionar c1/s1 e trocar a turma para c-empty (log `tmp/aja13/browser-class-change-red.log`). O select visual ficava vazio, mas subjectId interno continuava s1.
- **Navegador GREEN com duas sessoes:** `tmp/aja13/browser-scope-safety.js` e `tmp/aja13/browser-scope-safety-final.log` confirmam POST 201 para aviso global c1; professor tem 0 botoes Editar/Retirar nesse aviso; admin tem ambos; aviso/evento class-wide de c-empty nao aparece no mural nem na resposta real GET /calendar?subjectId=s1; trocar para c-empty limpa a disciplina e POST retorna 201 com subjectId:null. Logs registram respostas reais; nenhum sucesso HTTP foi simulado.
- **Gates apos este lote:** `npm.cmd test` 326/326 (`tmp/aja13/npm-test-scope-safety-final.log`); typecheck aprovado (`tmp/aja13/typecheck-scope-safety-final.log`); arquitetura aprovada, 184 modulos (`tmp/aja13/architecture-scope-safety-final.log`); build Next.js 16.3.8/Turbopack estatico aprovado sem fallback Webpack (`tmp/aja13/build-scope-safety-final.log`). `graphify update .` concluiu; ports 3000, 3001 e 3002 ficaram livres apos o teste. OpenAPI/exemplos nao mudaram.
- `git diff --check` limpo antes desta nota documental; repetir apos editar docs. Issue permanece aberta aguardando recheck ECC Sol e Ponytail.

## Recheck AJA-13: prazos nos proximos encontros

O criterio explicito da issue, “Calendario e proximos encontros derivam dos avisos e prazos visiveis”, esta cumprido: a API de calendario ja retorna avisos e assessments sob ACL; `upcomingMeetings` agora conserva todas as fontes futuras, ordena por data/hora/ID, remove datas anteriores e limita a tres. Cada link preserva o href recebido da fonte. Os dois dashboards rotulam `Acontecimento` e `Prazo de atividade`, com titulo, aria-label/aria-labelledby, status de carregamento e estado vazio coerentes.

- RED/GREEN: `node --experimental-strip-types --test --test-name-pattern="dashboard upcoming meetings include future visible" tests/announcements-client.test.ts`. RED `tmp/aja13/upcoming-deadlines-red.log` omitiu o assessment futuro e retornou apenas os avisos; GREEN `tmp/aja13/upcoming-deadlines-green.log` inclui o assessment futuro, descarta o passado, ordena, preserva href e corta em tres.
- API/ACL: `calendar includes assigned assessment deadlines and hides unassigned work from students` em `tests/http-announcements.test.mjs` verifica aluno atribuido e nao atribuido; ambos recebem `work1`, somente o aluno atribuido recebe `quiz-open`.
- Navegador em duas sessoes: `tmp/aja13/browser-deadline-acl.js` e `tmp/aja13/browser-deadline-acl.log` visitam `/calendario` autenticados; GET real retorna 200, aluno `student-two` ve `quiz-open` e `work1`, aluno `student` ve apenas `work1`. A DOM mostra os prazos; recarga e a abertura do detalhe “Atividade” foram verificadas.
- O primeiro roteiro de dashboard em `/` (`tmp/aja13/browser-upcoming-deadlines.js`, `tmp/aja13/browser-upcoming-deadlines.log`) expirou esperando o GET `/calendar`; nao foi contado como validacao nem como falha do produto. O escopo AJA-16 bloqueia a jornada DOM do painel neste ponto. A projecao usada pelos dois dashboards tem teste unitario dedicado; a limitacao de DOM continua registrada.
- Gates finais apos a mudanca: `npm.cmd test` 326/326 (`tmp/aja13/npm-test-upcoming-final.log`), typecheck aprovado (`tmp/aja13/typecheck-upcoming-final.log`), arquitetura aprovada com 184 modulos (`tmp/aja13/architecture-upcoming-final.log`), build estatico Next.js 16.3.8/Turbopack aprovado sem fallback Webpack (`tmp/aja13/build-upcoming-final.log`). `graphify update .` executado; OpenAPI/exemplos nao mudaram.

### Tentativa final do DOM do dashboard por navegacao SPA

- Roteiro autocontido: `tmp/aja13/browser-dashboard-spa-shell.js`; resultado real: `tmp/aja13/browser-dashboard-spa-shell.log`. Uma sessao student-two autenticada abre `/perfil`, clica no link acessivel `Meu painel` (`href=/`) sem sair do contexto e chega a `/`. O DOM mostra “Esta area esta temporariamente indisponivel.”, o heading “Proximos encontros e prazos” nao existe e nao houve GET `/api/v1/calendar`. A recarga manteve o estado bloqueado e continuou sem o heading.
- O motivo e verificavel no AppShell: children so renderizam quando `httpRoutes.has(path)`; `/` nao esta integrado nessa lista enquanto AJA-16 nao migra o shell/painel. Isso prova que a pagina dashboard nao pode ser exercitada por browser neste checkout sem modificar escopo AJA-16. Nao contabilizar como GREEN de UI nem alterar o gate.
- A API/ACL e a projecao pura continuam cobertas pelos testes GREEN e a tela `/calendario` foi exercitada em duas sessoes em `tmp/aja13/browser-deadline-acl.log`. A verificacao DOM de dashboard fica pendente de AJA-16; conforme AGENTS, mantenha AJA-13 aberta ate essa dependencia permitir a jornada e os reviewers rechecaren.

### Revisoes independentes finais

- ECC Sol: **APPROVE**, sem achados pendentes. Releu o diff completo e callers, confirmou as correcoes e executou novamente 29 testes focados, todos aprovados. Conferiu RED/GREEN, ACL em duas sessoes e os gates finais (326 testes, typecheck, arquitetura, build estatico e `git diff --check`). Confirmou que a DOM do dashboard segue bloqueada por AJA-16.
- Ponytail-review Sol: **Ship**. Releu o diff completo, callers e correcoes anteriores, incluindo a projecao dos dois tipos de eventos; executou novamente 29 testes focados e conferiu logs dos gates e jornadas de browser. Registrou como limites nao reexecutar build/jornadas completas e a DOM do dashboard, bloqueada por AJA-16.
- Na revisao inicial, os dois reviewers aprovaram o codigo, mas a issue aguardou a validacao DOM obrigatoria do dashboard apos AJA-16. Esse bloqueio foi resolvido pela jornada documentada abaixo e rechecado pelos mesmos reviewers.

### Recheck DOM do dashboard apos AJA-16 - revisoes finais aprovadas

- Roteiro Playwright autocontido: `docs/http/evidence/AJA-13/dashboard-calendar-browser.js`; resultado: `docs/http/evidence/AJA-13/dashboard-calendar-browser.log`; bootstrap da API/fixture e preflight do DTO: `dashboard-calendar-api.mjs` e `dashboard-calendar-api.log` no mesmo diretorio.
- Fixture isolada criada com `openRepository`/`createApp` em diretorio temporario. Nenhum runtime persistido local foi editado. O bootstrap limpou apenas os avisos seed do store temporario e criou um assessment futuro elegivel `aja13-agenda-assessment`; preflight real `GET /me/dashboard` confirmou o evento antes de iniciar o browser. O aviso foi publicado pela UI, sem seed manual, por `teacher-a` (POST 201).
- O browser autenticou docente e aluno e, em ambos, clicou a navegacao SPA de `/perfil` para `Meu painel`; `performance.timeOrigin` permaneceu igual. GET do dashboard foi 200 para cada perfil. Na equipe, o aviso aparece dentro de `section[aria-labelledby="events-title"]`; no aluno, dentro de `section[aria-labelledby="student-events"]`. Em cada secao o script verifica um unico link para o ID publicado, titulo, data 05 nov., horario 18:30 e href `/avisos/#aviso-...` depois do load e reload.
- A agenda do aluno tambem valida dentro de `student-events` o assessment futuro “AJA-13 atividade futura na agenda”, data 07 nov., 19:30 e href `/questionarios/responder/?id=aja13-agenda-assessment`, antes e depois de reload. O clique abre o destino e mostra o titulo da atividade no DOM.
- Docente e aluno clicam o card do acontecimento dentro da propria secao da agenda. Ambos chegam a `/avisos/#aviso-...`; o GET de avisos e 200 e o heading com o titulo publicado existe dentro do elemento `#aviso-...`.
- Resultado: respostas reais registradas para POST de publicacao 201, GET do dashboard 200, GET do assessment 200, GET de avisos 200; asserts DOM scoping, data/titulo/href, reload e destino passaram. Recheck ECC Sol APPROVE e Ponytail-review Sol Ship, sem achados pendentes. Checklist AJA-13 concluido. Os revisores executaram 28 testes focados, todos aprovados; nao repetiram build/gates completos porque esta etapa apenas acrescentou evidencia documental/browser e nao alterou codigo.
