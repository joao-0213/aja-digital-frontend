# Validação AJA-12 — entregas de trabalho e devolutivas

## Estado e escopo

- Implementação iniciada na branch `feat/frontend-http`, a partir de `1c3e5ee6fdb4a9f710f36d74feeb4af7d9edf2b5`. O commit documental de `AGENTS.md` `45dfa12` foi feito pelo coordenador e permanece fora desta issue.
- Escopo: API de submissions e arquivos de trabalho, projeções por papel, adapter HTTP, tela de entrega, editor de feedback, listas/resumos, acesso direto por `?entrega=` e contrato OpenAPI.
- A implementação foi concluída e aprovada pela revisão independente Sol após o recheck. O coordenador registrará as alterações em um commit da AJA-12.

## RED/GREEN

Os comandos abaixo usam o runner `node:test` do projeto. Os logs completos estão em `tmp/aja12/`.

| Comando / teste | RED observado | GREEN |
| --- | --- | --- |
| `node --test tests/http-submissions.test.mjs` — `submission reads require a session and return a student-safe page` | `tmp/aja12/red-submissions.log`: rota ausente respondeu `404`; o contrato esperava `401` para consulta anônima. | `tmp/aja12/green-submissions.log`: 23/23 testes da camada de submissions, regras de trabalho e feedback passaram. |
| `node --test tests/http-submissions.test.mjs` — seis contratos de submissions/feedback | `tmp/aja12/red-contracts.log`: seis falhas `404` nos endpoints ainda não implementados. | `tmp/aja12/focused-final-2.log`: 51/51 testes focados, incluindo `http-materials`. |
| `node --test tests/assessments-client.test.ts` — `work adapter freezes submissions, uses multipart upload, and rejects a late session response` | `tmp/aja12/red-client-adapter.log`: `api.allSubmissions is not a function`. | `tmp/aja12/green-client-adapter.log`: 12/12 passaram. |
| `npm.cmd test` — falha de fixture `http-materials` | `tmp/aja12/npm-test.log`: 307/308; o caso esperava upload de trabalho após entrega. A restrição de upload excessiva foi removida, sem alterar o contrato existente. | `tmp/aja12/npm-test-final.log`: 308/308 passaram. |
| Feedback de docente, UI após publicação | `tmp/aja12/browser-feedback-publish-state-red.log`: `POST /publish-feedback` retornou `200` e o DTO tinha nota zero/publicação, mas o resumo docente continuou “Entregue — aguardando feedback”. | `tmp/aja12/browser-feedback-publish-state-green-final.log`: o mesmo script, após rebuild do bundle estático, marcou `assertion: PASS`; a tela atualizou o resumo e mostrou comentário e nota. |

Os logs `tmp/aja12/browser-feedback-publish-state-green.log` e `tmp/aja12/browser-feedback-concurrency.log` são tentativas inconclusivas: o servidor estático ainda servia o bundle anterior ao rebuild. O run `tmp/aja12/browser-feedback-concurrency-final.log` também parou por colisão de strict mode no seletor do teste (status, editor e conflito exibiam o mesmo texto); não indica falha do produto. O run completo válido é `tmp/aja12/browser-feedback-concurrency-final-rerun.log`, com todos os checks verdadeiros.

O run `tmp/aja12/browser-delivery-flow.log` reutilizou um rascunho já criado em tentativa anterior e tentou adicionar novamente o mesmo arquivo e link; o PATCH de duplicatas recebeu `422`. A leitura posterior comprovou que o rascunho anterior estava persistido. O run `tmp/aja12/browser-delivery-flow-02.log` parou no waiter de resposta; não foi contado como GREEN. O fluxo limpo abaixo foi executado uma vez com atividade e anexos novos.

O teste `red-grade.log` foi erro de fixture/semântica: o serviço HTTP normaliza `maxGrade: null` para ausência de escala; na regra legada local, `null` preserva a semântica antiga que aceita zero. O contrato HTTP rejeita nota quando não há escala. Esse ajuste não foi contado como defeito do legado.

## Navegador e API real

Os scripts Playwright CLI executaram em Edge headless contra a exportação estática em `http://127.0.0.1:3001` e JSON Server separado em `http://127.0.0.1:3002`. As sessões usaram apenas contas fictícias e contextos independentes. Sucessos foram respostas reais; a falha de resposta foi criada com `route.fetch()` real seguido de aborto da resposta ao browser.

- `tmp/aja12/browser-delivery-flow-03.log`: aluno preparou o rascunho pela UI com arquivo de zero bytes e link; o rascunho persistiu na revisão 1; `?entrega=<id>` reabriu o estado salvo. O primeiro POST de envio comitou no servidor e a resposta foi abortada. A UI repetiu o POST com a mesma chave; servidor respondeu `200`, devolveu o mesmo recibo e a confirmação permaneceu após reload. O DTO do aluno não continha `feedbackDraft` nem `feedbackHistory`.
- `tmp/aja12/browser-feedback-concurrency-final-rerun.log`: dois docentes abriram a revisão 2; uma gravação concorrente retornou `409`, exigiu consulta/ack e preservou o texto local. Salvar retorno não publicou. O aluno viu somente retorno publicado, com nota zero válida. Um rascunho posterior manteve a publicação anterior visível; a republicação criou histórico de dois registros com autoria/data do servidor e o aluno recebeu a nova publicação.
- `tmp/aja12/browser-file-access.log`: docente atribuído consultou metadados e bytes do arquivo vazio; conteúdo foi entregue como `application/octet-stream`, 0 bytes. `student-two` recebeu `404` na entrega e no download, e a navegação direta por `?entrega=` não revelou a entrega.
- `tmp/aja12/browser-responsive-focus.log`: sem overflow horizontal a 390, 768 e 1440 px; formulário de entrega utilizável. Escape fechou o diálogo e o foco retornou ao botão disparador após dois `requestAnimationFrame`. Zoom CSS a 200% foi verificado pontualmente; zoom nativo do navegador não foi verificado.

Os testes de serviço em `tests/http-submissions.test.mjs` também cobrem anexo inválido, reutilização de arquivo de outra conta/finalidade/pai, lote atômico, bytes diferentes com mesma chave, arquivo de zero bytes, vínculo revogado em download e replay, equipe em turma encerrada, rascunho docente concorrente, persistência e prazo. O navegador não revogou um vínculo durante a própria sessão; esse caso foi verificado nos testes HTTP do serviço.

## Gatilhos finais

Executados após a última alteração de interface; logs em `tmp/aja12/`.

| Gate | Resultado |
| --- | --- |
| `npm.cmd test` | 308 testes, 308 passaram, 0 falharam. |
| `npm.cmd run typecheck` | Passou; `next typegen` e `tsc --noEmit`. |
| `npm.cmd run check:architecture` | Passou; 179 módulos, fronteiras preservadas, nenhum ciclo estático. |
| `npm.cmd run build` | Build padrão passou com Next 16/Turbopack; export estático gerou 24 rotas. Portas 3000 e 3002 estavam ausentes antes e depois do build. Não foi necessário fallback Webpack. |
| `python -m openapi_spec_validator docs/http/openapi.json` | `docs/http/openapi.json: OK`. |
| `python tmp/validate-http-examples.py` | 830 exemplos verificados, 0 erros. Há somente um aviso de depreciação do `jsonschema.RefResolver`. |
| `graphify update .` | Atualizou o grafo local; saída ignorada pelo Git. |

O contrato e os exemplos OpenAPI foram atualizados a partir das projeções reais do serviço; os testes verificam que aluno não recebe campos de feedback privado e que a equipe recebe histórico/rascunho após entrega concluída.

## Revisão

A revisão independente Sol do diff completo e o recheck após eventuais correções ainda estão pendentes com o coordenador. O status da issue não deve ser marcado como concluído até esse fluxo terminar.

## Recheck após REQUEST CHANGES do Sol

O parecer independente confirmou três defeitos MEDIUM. Todos foram corrigidos antes do recheck final:

1. O acumulador de uploads agora parte do estado mais recente em cada arquivo. Cada sucesso atualiza recuperação e listas com a etapa acumulada; uma falha intermediária deixa somente a intenção não resolvida e permite repetir a mesma chave/arquivo. `tests/work-upload-batch.test.ts` cobre dois sucessos, falha no segundo e retomada.
2. Anexos persistidos consultam metadados pela API autenticada e autorizada. A prévia aparece apenas para PDF, PNG, JPEG e WebP; conteúdo continua sendo baixado binariamente, e HTML segue sem prévia. A consulta de metadados também confirma bytes disponíveis; anexo legado sem bytes continua indisponível sem inventar conteúdo.
3. Publicar o retorno invalida a consulta de entregas da equipe. A linha de resumo passa a refletir a publicação sem recarga e continua correta após reload.

| Comando / cenário | RED | GREEN |
| --- | --- | --- |
| `node --experimental-strip-types --test tests/work-upload-batch.test.ts` | `tmp/aja12/work-upload-batch-behavior-red.log`: com o algoritmo antigo de snapshot recriado por arquivo, o teste esperava `{}` mas ainda havia `local:a` no mapa após dois sucessos. O teste inicial que falhou somente por módulo ausente (`work-upload-batch-red.log`) não foi contado como RED. | `tmp/aja12/work-upload-batch-green-final.log`: 2/2; mapas acumulados limpos após dois sucessos e a intenção `key-b` foi reutilizada após falha intermediária. |
| Navegador: uploads múltiplos, resposta de upload perdida e retomada | `tmp/aja12/browser-multi-upload-review-fix-red-final.log`: o segundo upload comitou com HTTP 201 e a resposta foi abortada; Salvar ficou desabilitado. Em outra atividade, dois uploads e `POST /submissions` retornaram 201 com dois arquivos, mas a interface ainda dizia “Alterações locais ainda não salvas.” | `tmp/aja12/browser-multi-upload-review-fix-green.log`: o replay reutilizou a mesma chave e o mesmo ID de arquivo; duas referências distintas foram persistidas uma vez. Dois uploads sucessivos terminaram em revisão 1 sem alerta local pendente. |
| Navegador: prévia remota após reload | `tmp/aja12/browser-work-preview-review-fix-red.log`: PNG persistido e metadados autorizados 200/image/png, mas estudante e docente não tinham botão de prévia. | `tmp/aja12/browser-work-preview-review-fix-green-final4.log`: PNG carregou a imagem 1×1 real para estudante e docente; metadados e bytes autorizados responderam 200. HTML ficou sem prévia para ambos. O download do PNG concluiu com nome esperado e sem erro. |
| Navegador: linha externa do resumo docente após publicação | `tmp/aja12/browser-feedback-list-review-fix-red.log`: `POST /publish-feedback` e DTO deram 200/publicado com nota zero, mas a linha continuou aguardando até reload. | `tmp/aja12/browser-feedback-list-review-fix-green.log`: a linha mudou para “Feedback disponível” imediatamente e manteve o estado após reload. |
| Jornada concorrente completa de docentes/aluno | O run histórico `browser-feedback-concurrency-final-rerun.log` foi insuficiente para a linha da lista, como apontou o revisor; verificava o editor e o retorno do aluno. | `tmp/aja12/browser-feedback-concurrency-review-fixes.log`: conflito 409 exigiu consulta/ack e preservou texto local; rascunho ficou privado, nota zero foi salva, a linha da equipe atualizou na publicação, o aluno viu a publicação anterior durante novo rascunho e a republicação manteve histórico/autoria. |

Observação de instrumentação: `browser-multi-upload-review-fix-red-run2.log` e o primeiro script de prévia tiveram falhas de locator/espera e não são evidências de produto; os logs RED comportamentais acima são os considerados. Uma primeira medição de prévia GREEN usou seletor CSS de elemento `<dialog>` quando a composição usa `role="dialog"`; a correção do locator está refletida em `green-final4`. A prévia foi exercitada com PNG, não separadamente com PDF. O zoom nativo do navegador continua sem verificação; o zoom CSS a 200% segue coberto pelo checkpoint anterior.

## Gates após as correções

| Gate | Resultado mais recente |
| --- | --- |
| `npm.cmd test` | `tmp/aja12/npm-test-review-fixes.log`: 310/310 passaram. |
| `npm.cmd run typecheck` | `tmp/aja12/typecheck-final-review-fixes.log`: passou (`next typegen` e `tsc --noEmit`). |
| `npm.cmd run check:architecture` | `tmp/aja12/architecture-final-review-fixes.log`: passou; 180 módulos, fronteiras preservadas, sem ciclos. |
| `npm.cmd run build` | `tmp/aja12/build-final-review-fixes.log`: build padrão passou e exportou 24 rotas. Portas 3000/3002 ausentes antes e depois; não foi necessário Webpack fallback. |
| OpenAPI e exemplos | `tmp/aja12/openapi-validation-review-fixes.log`: OK. `tmp/aja12/http-examples-validation-review-fixes.log`: 830 exemplos, 0 erros; aviso de depreciação de `jsonschema.RefResolver`. |
| `graphify update .` | `tmp/aja12/graphify-update-review-fixes.log`: grafo atualizado localmente; aviso do extrator sobre arquivos sem símbolos não alterou o resultado. Artefatos continuam ignorados pelo Git. |

## Resultado da revisão independente

O mesmo revisor Sol que emitiu REQUEST CHANGES reexaminou o diff completo após as três correções: **APPROVE, zero achados pendentes**. A revisão incluiu os cinco arquivos novos, os testes focados e as evidências dos gates e do navegador. O revisor executou independentemente 22/22 testes focados; 310/310 testes totais passaram.

Limites de validação: a prévia foi exercitada com PNG, mas sem um cenário separado de PDF; o zoom nativo do navegador não foi verificado. O zoom CSS a 200% foi verificado pontualmente. A limitação do PDF não impediu o aceite do revisor.

A implementação e a revisão estão concluídas. O commit da issue será feito pelo coordenador; a AJA-13 permanece aguardando a pausa solicitada pelo usuário.
