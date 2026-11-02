# AJA-04 — infraestrutura cliente

Base da issue: `683137b`. Escopo deste registro: `src/lib/http-client.ts`, `src/lib/http-query.ts`, `src/hooks/use-http-query.ts` e suas duas suítes. O serviço, revisão independente e gates completos são consolidados pelo agente principal no registro da issue.

Aplicados ECC TDD/verification-loop, `arquiteto-nextjs`, `ARQUITETURA.md` e guias locais Next.js `01-app/02-guides/static-exports.md` e `01-app/01-getting-started/05-server-and-client-components.md`. A API autenticada continua sendo chamada no navegador: não há carga institucional no build, mudança de rota, provider legado, Server Action ou backend Next.js nesta fatia.

## RED/GREEN observado

1. Antes de criar implementação, adicionadas `tests/http-client.test.ts` e `tests/http-query.test.ts`. Comando: `node --experimental-strip-types --test tests/http-client.test.ts tests/http-query.test.ts`. RED: exit 1, duas suítes falharam na importação com `ERR_MODULE_NOT_FOUND` para `src/lib/http-client.ts` e `src/lib/http-query.ts`. Esta evidência é de implementação ausente; os casos individuais ainda não foram executados nesse RED.
2. Criados transporte, controlador puro e adaptador React. Mesmo comando: GREEN, 8 testes passaram. `npx.cmd tsc --noEmit`: exit 0.
3. Adicionado cenário de retry/invalidação contra servidor HTTP realmente escutando em porta efêmera. `node --experimental-strip-types --experimental-test-coverage --test tests/http-client.test.ts tests/http-query.test.ts`: 9/9 passaram; linhas 100%, branches 89,22%, funções 100% nos dois módulos puros carregados. Essa cobertura não inclui o hook React.
4. `npm.cmd run check:architecture`: exit 0, 155 módulos, fronteiras preservadas e nenhum ciclo estático. Build e suíte completa ficam sob coordenação da issue, não foram executados por este subagente.

## Contratos exercitados

- Requisições reais GET/POST, JSON, corpo efetivamente recebido, prefixo `/api/v1`, resposta vazia 204 e bytes PDF preservados.
- `credentials: include` é observado no init do fetch (Node não mantém cookie jar de navegador). A sessão real/cookies de navegador são aceite de AJA-05, não comprovados por esse teste.
- Respostas 401/403/404/409/422/500/503 distintas, código/mensagem/requestId/details preservados. Timeout, aborto prévio/em andamento, erro de conexão e JSON inválido são diferentes; não há fallback ao seed.
- Destino absoluto, host externo e travessia para fora da base são recusados antes de fetch. URL pública configurável por `NEXT_PUBLIC_API_URL`, acessada literalmente para substituição no build estático; cliente pode receber URL explícita em testes.
- Controlador limpa dados imediatamente ao iniciar outra consulta e descarta respostas antigas mesmo quando o loader ignora AbortSignal. A troca de sessão/filtro gera novo controlador no hook, escondendo o snapshot anterior já na renderização, antes da limpeza do efeito.
- Retry e invalidação geram HTTP novo; falha descarta sucesso anterior. Cancelamento/logout por mudança de identidade libera consulta, apaga dados e impede erro tardio de reaparecer.

## Uso e limites

`useHttpQuery({ sessionKey, key }, load, enabled)` requer `sessionKey` diferente em cada entrada/saída, inclusive novo login da mesma conta, e `key` com todos os filtros/argumentos que alteram resultado. `load` deve ser estável via `useCallback`; o hook reinicia a consulta quando ele muda. Não há cache global ou persistência institucional. Retry/invalidate são do controlador ativo, sem invalidar consultas de outros domínios implicitamente; as fatias futuras devem chamar a invalidação dos consumidores afetados.

O tipo genérico de retorno descreve DTOs conhecidos pelo consumidor, sem validação JSON Schema em runtime. Corpos de upload podem ser `FormData`/Blob, sem Content-Type multipart manual; respostas binárias usam `responseType: 'blob'`. Cancelamento não representa falha de negócio e comando não é repetido automaticamente: idempotência fica sob intenção explícita do chamador.

Os testes de estado exercitam o controlador puro; o hook ainda não foi montado em navegador nesta fatia. Integração de telas, CORS/cookies reais, recarga e revogação da sessão fazem parte das issues seguintes e da validação global. Nenhum domínio foi declarado migrado por ter esta infraestrutura disponível.
