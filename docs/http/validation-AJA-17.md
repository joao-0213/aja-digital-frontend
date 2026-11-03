# AJA-17 · Corte do runtime local e revisão de linguagem

## Escopo e aceite

Baseline: `9a4e0b9f2e19868ff1b4341aa6afc4b7e8fa8f7e` (`feat/frontend-http`, após AJA-16). Entradas: providers/contexto, telas e rotas do App Router, armazenamento de arquivos, textos públicos, documentação e contrato de seed do servidor.

- Remover estado, transporte, dados completos, relógio fixo, coordenação por Web Locks e anexos IndexedDB do runtime do cliente.
- Manter `useApp` para notificações/interface e identidade autorizada exclusivamente pela sessão HTTP.
- Auditar as 22 rotas online/offline, textos visíveis e acessíveis e HTML estático; indisponibilidade não confirma ações.
- Preservar armazenamento legado local sem lê-lo como sessão nem apagá-lo na primeira abertura.
- Atualizar a documentação vigente e manter credenciais de teste somente no guia técnico.

## TDD

| Fase | Comando e teste | Resultado |
| --- | --- | --- |
| RED | `node --test tests/client-boundary.test.mjs` — `frontend source does not import seeds or legacy browser transport/storage` | Falhou como esperado: `hooks/use-mock-query.ts` e `providers/use-demo-state.ts` ainda importavam transporte mock/seed no código-fonte. |
| GREEN | `node --test tests/client-boundary.test.mjs` | Passou após remover `useDemoState`, `useMockQuery`, mock transport, banco completo do frontend, IndexedDB de anexos e relógio fixo; provider deixou de montar `MockDatabase` e callbacks locais. |
| RED | `playwright-cli` em `/rota-inexistente-aja17` | Falhou como esperado: o servidor estático respondeu HTTP 404, mas o gate de rotas HTTP exibia “Esta área está temporariamente indisponível” em vez da página 404. Evidência: `evidence/AJA-17/route-not-found-red.log`. |
| GREEN | `playwright-cli` após remover gate por `httpRoutes` no shell | Passou: HTTP 404, heading “Página não encontrada”, sem erro de indisponibilidade da API. Evidência: `evidence/AJA-17/route-not-found-green.log`. |
| RED · recheck | `playwright-cli` em `/forum` e `/forum/topico?id=topic1` com sessão HTTP `admin` e IDs iguais aos drafts antigos | Falhou como esperado: a composição antiga foi restaurada e reserializada (`subjectId` virou `targetSubject`); a resposta antiga apareceu no textarea. Após reload, as chaves antigas continham os novos valores digitados. Evidência: `evidence/AJA-17/forum-legacy-draft-red.log`. |
| GREEN · recheck | `node --experimental-strip-types --test tests/forum-draft.test.ts` e cenário browser após build | Passou: compose usa `aja-http-forum-compose:*`, reply usa `aja-http-forum-reply:*`; drafts atuais recuperam após reload; chaves antigas byte a byte permanecem intactas e não são renderizadas. Evidência: `forum-draft-green.log`, `forum-legacy-draft.js` e `forum-legacy-draft-green.log`. |
| RED · draft unit | `node --experimental-strip-types --test --test-name-pattern="HTTP forum compositions use an isolated key" tests/forum-draft.test.ts` sob o helper anterior | Falhou com `actual: undefined`, `expected: 'aja-http-forum-compose:student-a:new'`: não existia namespace HTTP. Evidência: `evidence/AJA-17/forum-draft-red.log`. |
| RED · boundary | `node --test --test-name-pattern="client import policy resolves relative paths and aliases" tests/client-boundary.test.mjs` sob a resolução anterior, que não classificava destinos fora de `src/` | Falhou na assertion de `../../../../server/fixtures/proporcoes.pdf` com `false !== true`, provando que um import relativo de fixture ultrapassava a cerca. Evidência: `evidence/AJA-17/client-boundary-red.log`. |
| GREEN · boundary | `node --test tests/client-boundary.test.mjs` | Passou: resolução pelo caminho do importador/alias bloqueia seed, fixtures de servidor, transporte de teste e `demo-storage`; mantém alias interno permitido. 2 testes, 0 falhas. Evidência: `client-boundary-green.log`. |

## Evidências

Os cenários usam scripts autocontidos em `evidence/AJA-17/`; os logs foram gravados automaticamente. Cada rota foi verificada após hidratação por heading, texto, controles acessíveis e resposta HTTP do export.

| Cenário | Resultado verificado | Evidência |
| --- | --- | --- |
| 22 rotas com API ativa | 22/22 retornaram HTTP 200 no export e renderizaram DOM com heading e texto acessível; cópia de produto sem “demo”, “demonstração” ou “protótipo”; reload de `/` manteve heading. | `routes-active.js`, `routes-active.log` |
| 22 rotas com API indisponível | API realmente parada: probe `fetch` falhou por rede; 22/22 rotas ainda retornaram HTTP 200 no export. 19 rotas protegidas exibiram erro de indisponibilidade após carga; `/login`, `/cadastro` e `/recuperar-senha` renderizaram seus formulários públicos. Tentativa real de login falhou por conexão recusada e não mostrou sucesso local. | `routes-offline.js`, `routes-offline.log` |
| Perfil anterior | Perfil isolado continha identidade sentinel, chaves antigas em local/session storage, drafts e Blob no IndexedDB. Após primeira abertura e reload, `/auth/session` retornou 401 e redirecionou a `/login`; nenhum sentinel foi mostrado/preenchido, nenhum POST/PUT/PATCH/DELETE à API ocorreu e valores/chaves/Blob permaneceram byte a byte. Recheck após a correção: mesmos resultados. | `profile-legacy.js`, `profile-legacy-recheck.log` |
| Navegação móvel e rodapé | Viewport 390×844; diálogo acessível, Escape fecha e devolve foco; navegação para “Meu perfil”, rodapé “AJA Digital”/“Sair”, sem overflow horizontal. | `mobile-navigation.js`, `mobile-navigation.log` |
| Privacidade | Diálogo abre por botão, título “Privacidade”, texto presente, botão de fechar e Escape restauram foco; não há rótulo de demo/protótipo. | `privacy-ui.js`, `privacy-ui.log` |
| 404 | Navegação para rota ausente exibe a página exportada “Página não encontrada”, sem erro HTTP genérico. | `route-not-found.js`, `route-not-found-red.log`, `route-not-found-green.log` |
| Exportação | `npm.cmd run check:export` após build examinou 151 arquivos de `out/`; nenhum marcador privado de seed/credencial ou transporte local. | `export-boundary.log` |
| Colisão de drafts autenticada | Com sessão real do usuário `admin`, o mesmo ID foi usado nas chaves antigas; `/forum` e o tópico foram montados e recarregados. A chave anterior não foi retomada, serializada nem apagada; compose/reply atuais foram recuperados pelos namespaces `aja-http-*`. | `forum-legacy-draft.js`, `forum-legacy-draft-red.log`, `forum-legacy-draft-green.log` |

## Recheck de revisão independente

ECC e Ponytail encontraram os mesmos dois achados P2 (quatro ocorrências de review): (1) restauração/escrita automática em chave antiga de compose; a inspeção ampliada encontrou o mesmo padrão na chave antiga de reply; (2) a barreira por texto não resolvia specifiers relativos fora de `src/` nem aliases. O compose e o reply agora usam namespaces HTTP novos; os antigos ficam intactos e nunca são lidos. A barreira resolve paths relativos e aliases definidos em `tsconfig.json`, rejeita imports fora de `src/` e paths de mocks/fixtures/transporte/legacy, e conserva somente o re-export type-only de `MockDatabase` usado pelas regras puras. ECC Sol rechecado: APPROVE, sem achados. Ponytail Sol rechecado: Ship, sem novos achados. Ambos confirmaram os P2 resolvidos. AJA-17 concluída e commitada pela coordenação.

## Auditoria de cópia

Busca de variantes em `src`, `public`, README, arquitetura, validação e inventário encontrou:

- Removida a descrição meta que apresentava o portal como demonstração; as 22 rotas também passaram pela asserção de DOM/nomes acessíveis sem texto de demo ou protótipo.
- `public/questions/transport.svg` mantém “Orçamento fictício · Transporte”: premissa matemática do enunciado, não descrição do serviço. Preservado como conteúdo pedagógico.
- `simulado` na migração de avisos antigos nomeia uma atividade presencial; preservado como dado acadêmico.
- `aja-digital-demo-v1`, `aja-demo-role`, `aja-demo-user` e `aja-demo-email` são nomes de compatibilidade do perfil antigo documentados para preservar dados, sem leitura/importação no cliente atual. A lógica/migrações antigas permanecem para testes, não entram no bundle cliente.
- Credenciais fictícias e reset operacional ficam exclusivamente em `docs/http/operator.md`; não são emitidos no export.

## Gates finais após correções

- `npm.cmd test`: 363 passaram, 0 falhas. `evidence/AJA-17/gate-npm-test.log`.
- `npm.cmd run typecheck`: passou (`next typegen` e `tsc --noEmit`). `evidence/AJA-17/gate-typecheck.log`.
- `npm.cmd run check:architecture`: passou, 181 módulos, sem ciclos. `evidence/AJA-17/gate-architecture.log`.
- `npm.cmd run build`: passou com Next.js 16.3.8/Turbopack; 24 páginas estáticas geradas. Não foi necessário fallback Webpack. `evidence/AJA-17/gate-build.log`.
- `npm.cmd run check:export`: passou após o build; 151 arquivos verificados. `evidence/AJA-17/gate-export.log`.

## Resultado

Implementação, rechecks de browser, gates e revisões independentes concluídos; critérios da AJA-17 verificados.
