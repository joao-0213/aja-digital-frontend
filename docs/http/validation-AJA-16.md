# AJA-16 - validacao dos paineis e projecoes

## Baseline e escopo

- Revisao inicial: `8ba3e08f9120b7632ea92c93341255066d5b542c`, branch `feat/frontend-http`.
- Criterios: `GET /me/dashboard` com projecao por perfil no servidor; progresso e retomada, matriculas, atividades, avisos, encontros, indicadores e links; horarios atuais em Sao Paulo; ACL revalidada a cada leitura; publicacao docente visivel no painel do aluno e destino funcional; sem baixar colecoes privadas completas no cliente.
- Entradas: `src/app/page.tsx`, `src/features/dashboard/components/{dashboard,student-dashboard,staff-dashboard}.tsx`, `src/lib/http-routes.ts`, `server/app.mjs`, `server/dashboard-service.mjs`, API e contrato OpenAPI.
- Graphify consultado antes de leituras/buscas nas areas afetadas e atualizado apos as correcoes. Artefatos locais ignorados.
- AJA-13: o shell habilitado permite revalidar agenda/links no painel; o checklist de AJA-13 permanece aberto e sem alteracoes.

## RED/GREEN e correcoes dos revisores

- RED inicial da issue: `node --experimental-strip-types --test tests/http-dashboard.test.mjs` falhou 4/4 com `404 !== 200`, pois `/me/dashboard` nao existia.
- GREEN inicial: testes focados do servico e gate HTTP passaram 11/11; revogacao posterior compara `/me/dashboard` e `GET /subjects/s1`, ambos retirando `s1` do acesso docente apos PATCH administrativo.
- Rechecks ECC Sol e Ponytail Sol apontaram quatro defeitos P2. No RED dos novos contratos, contagens esperadas estavam ausentes (`undefined`), o helper de horario ainda nao existia (`ERR_MODULE_NOT_FOUND`) e o enum OpenAPI retornava `Manh?`. O componente tambem usava hora crua da ISO. Os revisores reproduziram a exposicao de matriculas pessoais ao docente. A fixture original tinha dois assessments pendentes elegiveis; o teste adiciona tres para produzir exatamente cinco.
- Contagem: o servidor agora calcula `pendingAssessmentCount` antes do limite de tres itens; o painel do aluno mostra total 5 enquanto mantem somente tres resumos. RED/GREEN focado em `http-dashboard.test.mjs`.
- Horario: helper compartilhado `src/lib/dashboard-time.ts` formata data e hora com `America/Sao_Paulo`; testes cobrem `2031-06-16T00:30Z` -> `15 de jun. · 21:30` e conversao de tarde. Student e staff cards usam o helper.
- Enum: `DashboardClass.shift` volta a aceitar `Manha`, `Tarde` e `Noite`; teste valida schema e tipos de contagem no OpenAPI.
- Privacidade de matriculas: a projecao nao serializa DTOs, IDs, emails nem nomes de matricula pendente. `pendingEnrollmentCount` segue scope equivalente ao `GET /enrollments?status=pending`: teacher-a recebe 0, como o endpoint canonico; admin/student recebem apenas contagem correspondente ao seu scope.
- RED/GREEN final: `node --experimental-strip-types --test tests/http-dashboard.test.mjs tests/dashboard-time.test.ts tests/http-route-gate.test.ts` passou 16/16. Testes incluem 5 pendentes com payload limitado a 3, boundary de data em Sao Paulo, contrato OpenAPI e comparacao de matriculas privadas.

## Browser e API

- Fluxo original de publicacao docente, painel do aluno, destino do aviso, agenda AJA-13, estados vazios, admin, revogacao durante consulta e recuperacao de 503: `dashboard-browser.js` / `dashboard-browser-final.log`, `dashboard-failure-browser.js` / `dashboard-failure-browser.log`.
- Recheck focado do lote: `dashboard-review-api.mjs` monta uma fixture temporaria via `openRepository`/`createTransactionStore` e sobe a API real com `createApp`. A fixture seed original continha prazo vencido e atividade sem prazo, que ocupavam os tres cards de staff antes dos prazos do cenario. O setup remove apenas essas duas avaliacoes no store temporario e adiciona quatro copias futuras de `quiz-open`; ficam cinco atividades pendentes e tres cards com prazo. Nenhum estado persistido local foi editado.
- Script: `dashboard-review-browser.js`; log: `dashboard-review-browser.log`. Em browser Playwright com timezone `UTC`, duas sessoes autenticadas consultaram API real (`GET /me/dashboard` 200). DOM do aluno: indicador 5, tres cards e tres labels `Ate 15 de jun. · 21:30`; DOM da equipe: tres resumos com tres labels iguais. A ISO `2031-06-16T00:30:00.000Z` cruzou para 15/06 21:30 em ambos os paineis. O payload docente teve contagem de matriculas 0 e nao continha `e-pending` nem email pessoal.
- Tentativas iniciais de browser ficaram registradas nesta nota: seletores estritos conflitaram com titulo duplicado entre card/agenda; depois foi corrigido para asserts DOM focados. A primeira contagem de cards contou tambem os tres links da agenda; o seletor final limita-se a `section[aria-labelledby=student-deadlines]`. Nao houve defeito de produto nesses asserts.
- Limite: o browser focado de horario usou a fixture temporaria sintetizada; o browser anterior cobriu a massa real e publicacao real de aviso, mas nao publicou novas atividades. Juntos, os testes de API verificam total 5 -> resumos 3 e o browser confirma indicador/cards/horario renderizados por perfil.

## Gates e evidencias

- `npm.cmd test` - passou, 362/362 (`evidence/AJA-16/review-npm-test.log`).
- `npm.cmd run typecheck` - passou (`evidence/AJA-16/review-typecheck.log`).
- `npm.cmd run check:architecture` - passou, 188 modulos, fronteiras preservadas e sem ciclos (`evidence/AJA-16/review-architecture.log`).
- `npm.cmd run build` - passou com Next.js 16.3.8/Turbopack, 24 paginas estaticas (`evidence/AJA-16/review-build.log`). Webpack fallback nao foi executado.
- `git diff --check` - passou apos atualizar esta nota e os logs.
- API/Next/browser foram encerrados; verificar portas 3000/3002 livres apos o diff check.
- `graphify update .` executado apos o lote de codigo; diffs locais do grafo seguem ignorados.

## Revisao e status

- Revisoes iniciais independentes ECC Sol e Ponytail Sol solicitaram mudancas por quatro achados P2: total limitado pelo slice, horario UTC nos cards, enum `Manh?` e exposicao de matrículas pendentes privadas ao docente. Todos foram corrigidos com regressao RED/GREEN e revalidados no browser. Os mesmos revisores reexaminaram o diff final completo: ECC Sol APPROVE (16/16 focados, sem novos achados) e Ponytail-review Sol Ship (16/16 focados, sem achados). Logs dos quatro gates finais estao listados acima; nenhum reviewer alterou arquivos.
- AJA-13 segue aberta e intocada. A evidencia de agenda do painel fica disponivel para o recheck da coordenacao.
