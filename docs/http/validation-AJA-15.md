# AJA-15 — validação de chamadas e histórico de frequência

## Baseline e escopo

- Revisão inicial: `7085a038d339612bb6edba29e116bc271a0361a5` (`feat(forum): migrate discussions to HTTP`), branch `feat/frontend-http`, worktree limpo.
- Critérios: elegibilidade e gravação HTTP por disciplina/data/horário; marcação em lote, revisão e histórico no perfil autorizado; identidade única da aula e revisão obrigatória na edição. Aceite cobre duas sessões, criação concorrente, conflito com comparação salva/local, entrada/saída, matrículas antigas sem data, turma encerrada e docente desatribuído.
- Entradas: `src/features/attendance/components/attendance-page.tsx`, `src/lib/attendance.ts`, `src/lib/enrollment.ts`, `server/administration-service.mjs`, `src/features/students/components/student-details.tsx`, rotas estáticas `/frequencia` e `/alunos/perfil?id=…`.
- A API fica no processo JSON Server separado sob `/api/v1`. A tela continua estática no App Router e consulta a API no browser.
- Graphify: consultas iniciais e direcionadas cobriram `AttendancePage`, `recordAttendance`, `enrolledForLesson`, `/students/{id}`, autorização, serviço transacional, route gate e testes. `graphify update .` executado após a implementação; artefatos locais ignorados.

## RED/GREEN

- API RED: `node --experimental-strip-types --test tests/http-attendance.test.mjs` antes do serviço retornou 404 nos endpoints de elegibilidade, consulta e gravação (5 testes falharam pelo resolver ausente; o teste de isolamento ainda passava). Log de implementação está descrito nesta validação.
- API GREEN: o mesmo contrato agora cobre criação e reabertura por sessões independentes, uma única chamada natural por disciplina/data/horário, concorrência de primeira criação (um 201 e um 409), PATCH obsoleto, falha de persistência sem gravação parcial, autorização e projeção do histórico. A API revalida matrícula e elegibilidade dentro da transação no estado atual.
- Matrícula/histórico: `tests/http-attendance.test.mjs`, `tests/attendance.test.ts` e `tests/enrollment.test.ts` exercitam data anterior à entrada, dia após saída, registros legados sem data de vínculo, encerramento da turma, docente desatribuído, acesso ao próprio histórico e histórico de aluno dentro do escopo.
- Route gate RED: `node --experimental-strip-types --test tests/http-route-gate.test.ts` falhou porque `/frequencia` ainda não era uma rota HTTP habilitada. GREEN: a mesma suíte passou 4/4 após incluir a rota em `src/lib/http-routes.ts`. Evidência: [route-gate-red-green.log](evidence/AJA-15/route-gate-red-green.log).
- Browser RED: a primeira tentativa de conferir o 409 expirou porque o diálogo de confirmação bloqueava o botão de revisão. O diálogo agora fecha quando o servidor retorna conflito; a sessão preserva as marcações locais e permite conferir a versão atual. Browser GREEN: [attendance-browser.log](evidence/AJA-15/attendance-browser.log).

## API real e browser

- `tests/http-attendance.test.mjs` envia requisições HTTP reais ao `createApp` com sessões autenticadas separadas. A suíte prova 201/409 na criação concorrente, conflito de revisão sem substituição, leitura após recarga via segunda sessão, histórico autorizado e recusas por elegibilidade/escopo.
- Servidores locais `dev:full`: frontend Next em `http://127.0.0.1:3000`, API separada em `http://127.0.0.1:3002`. O roteiro [attendance-browser.js](evidence/AJA-15/attendance-browser.js) passou com três contextos isolados: professor A cria e recarrega; professor B reabre a mesma aula; gravação concorrente produz PATCH 409 e comparação salva/local; o perfil autorizado exibe o histórico; docente sem atribuição vê lista vazia e recebe 404 em consulta direta.
- Browser observou respostas reais: consulta elegíveis 200, consulta da aula 200, detalhe 200, edição inicial 200, PATCH obsoleto 409 e consulta direta do docente desatribuído 404. Não houve exceções de página.
- A entrada do perfil mostra presença/ausência, disciplina, dia e horário. Histórico e elegibilidade reaproveitam `enrolledForLesson`, sem inventar datas para vínculos antigos.

## Verificações finais

- `npm.cmd test` — passou, 345/345 testes.
- `npm.cmd run typecheck` — passou (`next typegen && tsc --noEmit`).
- `npm.cmd run check:architecture` — passou; 186 módulos, fronteiras preservadas, nenhum ciclo estático.
- `npm.cmd run build` — passou com Next.js 16.3.8 Turbopack; `/frequencia` e `/alunos/perfil` foram exportadas estaticamente. Webpack fallback não foi executado porque o build padrão passou.
- `graphify update .` e `git diff --check` — passaram após as mudanças de código.
- Cobertura: as transações e sessões concorrentes foram exercitadas no servidor JSON local de processo único; não comprovam durabilidade ou coordenação entre múltiplos processos em produção.

## Estado de revisão

Implementação e critérios de aceite estão cobertos por testes, requests reais e DOM após reload. Aguarda revisão independente ECC e revisão Ponytail antes de marcar a issue concluída. Ainda sem commit.

## Correções do recheck ECC Sol

Achados anteriores corrigidos; revisões finais: ECC Sol APPROVE e Ponytail-review Sol Ship, sem achados pendentes.

1. **HIGH — resposta atrasada da seleção anterior.** O carregamento agora carrega a identidade disciplina/data/horário capturada, ignora resultado ou erro quando a seleção mudou e só associa uma aula cujo subjectId/data/horário confere. A troca de seleção invalida a versão do carregamento, limpa os dados anteriores e bloqueia salvamento até a nova seleção terminar de carregar. O salvamento valida novamente a identidade da aula antes de escolher PATCH. RED independente: [reprodução do ECC com GET retido](evidence/AJA-15/attendance-stale-load-review-red.log) mostra resposta real da aula de 03/11 depois de a tela selecionar 04/11; o PATCH que apontava para o ID anterior foi abortado pelo revisor antes da persistência. GREEN browser após os ajustes do cliente: [script](evidence/AJA-15/attendance-stale-load.mjs) e [log](evidence/AJA-15/attendance-stale-load-green.log) retêm GETs HTTP reais de `/attendance/eligible` e `/attendance`, carregam a data seguinte, liberam as respostas antigas e confirmam que a tela mantém as marcações novas, não mostra “Atualizar chamada” e envia zero PATCH.

2. **MEDIUM — GETs divergiam do OpenAPI.** `GET /attendance` agora aceita `page`, `pageSize`, `sort=date|-date`, `subjectId`, `studentId`, `from` e `to`, filtra o intervalo civil, ordena por data e ID e responde o envelope paginado com DTO de equipe ou aluno. `GET /attendance/eligible` aceita paginação e responde apenas o DTO público contratado `{id,name,eligible,reason}` dentro de `{items,page,pageSize,total}`. O cliente busca todas as páginas de elegíveis e de aulas do dia, usa `from=to=data` para leitura de chamadas e escolhe horário localmente. RED: [log dos dois testes contratuais](evidence/AJA-15/attendance-contract-and-stale-red.log) registra os 422 anteriores. GREEN: `tests/http-attendance.test.mjs` cobre intervalo, sort ascendente/descendente, page/pageSize, DTOs exatos para equipe/aluno/elegíveis, e parâmetros inválidos; `tests/attendance-client.test.ts` cobre paginação do roster e query de data em conformidade.

- Browser de jornada completo reexecutado depois da normalização de páginas: [attendance-browser-run.mjs](evidence/AJA-15/attendance-browser-run.mjs), [roteiro](evidence/AJA-15/attendance-browser.js), [resultado](evidence/AJA-15/attendance-browser-final.log). Três contextos confirmaram criação, reload/reabertura por outra sessão, PATCH 409 com comparação salvo/local, perfil autorizado após reload e recusa 404 para docente desatribuído; não houve exceções de página.
- Um primeiro rerun do script de evidência parou porque o perfil passou a conter mais de uma marcação “Ausente”. O seletor do script foi ajustado para aceitar a primeira correspondência (a interface estava correta); o rerun acima passou.
- Evidência da revisão original, scripts e logs são locais em `docs/http/evidence/AJA-15`; nenhum segredo ou cookie foi registrado.

## Verificação após correções pós-ECC

- Reexecutado depois da última alteração de código: `npm.cmd test` — passou, 349/349; `npm.cmd run typecheck` — passou; `npm.cmd run check:architecture` — passou com 186 módulos; `npm.cmd run build` — passou com Next.js 16.3.8 Turbopack e export estático de `/frequencia` e `/alunos/perfil`. Webpack fallback não foi executado, pois o build padrão passou. Log completo: [final-gates.log](evidence/AJA-15/final-gates.log).
- Reexecutados no servidor `dev:full` após a normalização final e a validação de escopo: [corrida com resposta retida](evidence/AJA-15/attendance-stale-load-green.log) passou com GET 200 reais, duas respostas antigas retidas/liberadas e nenhum PATCH; [jornada duas sessões/perfil](evidence/AJA-15/attendance-browser-final.log) passou com reload, conflito 409, autorização e perfil visível após reload. Browser não registrou erros de página.
- `graphify update .` e `git diff --check` executados após atualizar código e evidências; sem alterações em `graphify-out/` versionáveis. Portas 3000/3002 foram encerradas após o browser.
- Testes verificam o serviço e a tela no servidor local JSON de processo único. Não demonstram consistência durável entre processos distintos.
- Revisões finais concluídas: ECC Sol APPROVE e Ponytail-review Sol Ship; AJA-15 não tem achados pendentes.

## Correção pós-Ponytail: detalhe de frequência do aluno

Ponytail-review apontou que `GET /attendance/{id}` estava protegido exclusivamente por `subjectFor()`, embora o OpenAPI permita estudante e o response seja `AttendanceRead` (Student ou Staff). O aluno já podia consultar sua própria marcação paginada, mas o detalhe dessa mesma chamada retornava 404.

- RED: [attendance-detail-student-red.log](evidence/AJA-15/attendance-detail-student-red.log) captura requisições HTTP com sessão autenticada: `GET /attendance?studentId=student` expõe `lesson1` com `present:true`, enquanto `GET /attendance/lesson1` retorna 404 onde o contrato exige 200.
- GREEN: [attendance-detail-student-green.log](evidence/AJA-15/attendance-detail-student-green.log), 11/11 testes focados. Um helper compartilhado aplica a mesma existência de marca própria e `enrolledForLesson()` na lista e no detalhe. O aluno recebe somente `{id, revision, createdAt, updatedAt, updatedBy, subjectId, date, time, present}`. Detalhes peer-only/sem marca, removidos e de disciplina inacessível retornam 404. Docentes e administradores continuam recebendo `records` completo quando autorizados.
- Nenhum código cliente mudou; a validação HTTP usa sessões distintas no servidor de teste real. Os testes anteriores de reload/perfil/browser seguem válidos; esta correção muda apenas a autorização e projeção server-side do detalhe.
- Rechecks concluídos em ordem: ECC Sol APPROVE e Ponytail-review Sol Ship; nenhum achado pendente.

- Revalidação após a correção de detalhe: `npm.cmd test` — 350/350; `npm.cmd run typecheck`, `npm.cmd run check:architecture` e `npm.cmd run build` — todos exit 0. Build Turbopack default exportou `/alunos/perfil` e `/frequencia`; Webpack fallback não foi necessário. Log atualizado e UTF-8: [final-gates.log](evidence/AJA-15/final-gates.log). `graphify update .` e `git diff --check` passam; browser não foi repetido porque nenhum cliente/tela foi alterado nesta correção.
