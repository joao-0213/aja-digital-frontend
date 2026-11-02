# AJA-04 — validação consolidada

Base: `683137b`. Escopo: transporte tipado e ciclo de consultas no cliente; fila/transação/comandos no serviço. [Arquitetura e uso](infrastructure.md), [evidência cliente](validation-AJA-04-client.md) e [evidência serviço](validation-AJA-04-server.md) detalham contratos e checkpoints RED/GREEN.

Estado: concluída, com revisão independente aprovada. Resultados intermediários abaixo preservam o histórico; o aceite final os complementa.

## Integração e gates observados

- As quatro suítes novas foram incluídas explicitamente no script `npm test`: transporte, consultas, consistência e integração entre cliente/serviço.
- `tests/http-stack.test.mjs` monta um servidor HTTP privado sobre a implementação real do serviço e usa `createHttpClient` real. Sessão ausente chega como erro tipado `session`; dois atores com a mesma revisão obtêm um resultado projetado e um erro tipado `conflict`, mantendo uma única gravação. Resultado: 1/1. Este teste acrescenta prova de integração às implementações já guiadas pelos RED/GREEN das duas frentes; não declara um novo comportamento de produto sem regressão inicial.
- `npm.cmd test`: primeira integração 157/157; após regressões adicionais de serviço, 161/161, zero falhas, cancelados ou ignorados. Resultado final será registrado após resolver os achados da revisão.
- `npm.cmd run typecheck`: saída 0.
- `npm.cmd run check:architecture`: saída 0, 155 módulos, fronteiras preservadas e nenhum ciclo de imports estáticos.
- `npm.cmd run build`: saída 0, Turbopack, 24 páginas estáticas em 1088 ms. Não houve fallback Webpack nesta issue.
- `git diff --check`: saída 0 na versão intermediária.

## Revisão em resolução

Revisor independente `review_aja01`, somente leitura, com ECC e diff completo desde a base. Achados confirmados encaminhados à implementação: replay aplicado novamente a um DTO projetado; expiração da intenção em 24 horas; recorte de campos alterado sem mudança do cargo; rejeição segura de callbacks assíncronos acidentais. A conferência final do revisor e nova suíte completa permanecem pendentes. Não houve dispensa de achado confirmado.

## Limites

A produção ainda expõe somente saúde. Atores controlados e rotas usadas para provar a infraestrutura existem exclusivamente nos testes. Não há troca de identidade por header no processo público. AJA-05 liga o mecanismo à sessão real; recursos e suas telas migram nas respectivas issues. Nenhum domínio foi fechado por haver transporte genérico disponível.

## Aceite final

`npm.cmd test` após todas as correções: **164/164**, zero falhas, cancelados ou ignorados. O revisor independente `review_aja01` inspecionou todo o diff desde `683137b`, executou as quatro suítes novas (23/23) e `git diff --check`, e emitiu **APPROVE**, sem achados pendentes. Conferiu que ausência de política de replay impede commit, que recorte de campos é reavaliado mesmo sem troca de cargo e que callbacks assíncronos não causam gravação nem rejeição não observada. Nenhum achado confirmado foi descartado.

Gates TypeScript, arquitetura e build padrão já aprovados conforme tabela; alterações posteriores ao build foram nos módulos JS exclusivos do serviço e seus testes/documentação. Não houve mudança posterior em código frontend. `graphify update .` concluiu com saída 0, 774 nós/2833 arestas; artefatos permaneceram locais. Políticas de replay, prazo e callbacks e seus RED/GREEN estão detalhados na evidência do serviço. O resultado não antecipa a migração de sessão ou recursos.

HTTP real em porta efêmera prova transporte, conflitos e falhas observadas; os testes Node não provam cookies de navegador, CORS de sessão, teclado ou uma jornada UI. O hook React é um adaptador fino verificado por tipos/arquitetura e pelo controlador puro, sem montagem em navegador nesta etapa. Não houve mudança visual ou migração de entrada de tela. A suíte de serviço não implica cobertura percentual; a medição específica dos dois módulos puros de cliente está registrada separadamente. A fila de gravação é para um único processo proprietário da base, não coordenação de múltiplos processos ou reset simultâneo.
