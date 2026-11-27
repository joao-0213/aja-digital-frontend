# AJA-07 — disciplinas, equipe, módulos e visitas no serviço

Revisão inicial `a7d5ca4`. Escopo: `server/subject-service.mjs`, composição em `server/app.mjs`, contexto privado adicional de replay no serviço comum e `tests/http-subjects.test.mjs`. Não houve alteração de runtime, package, frontend ou contrato pelo implementador do serviço. A composição segue `ARQUITETURA.md`, a skill `arquiteto-nextjs` e o guia instalado de exportação estática: dados autenticados ficam no processo separado de API, sem Server Actions, handlers Next dinâmicos ou seed no grafo cliente.

## Contratos e regras aplicadas

`GET /subjects` retorna resumos autorizados/paginados, com nome da turma, identidades docentes sem e-mail, permissão de gestão de conteúdo, indicador e IDs de publicações. `GET /subjects/{id}` retorna `{ subject, modules, projections }`: todos os módulos vivos do contexto e somente contagens autorizadas de materiais, atividades e avisos. Essas projeções preparam a integração posterior; não implementam antecipadamente upload, autoria de avaliação, mural ou leitor de material. Aluno recebe somente atividade publicada; equipe atribuída pode receber contagem de rascunhos compartilhados daquela disciplina, sem conteúdo, respostas, gabaritos ou rascunhos pessoais.

As fontes são filtradas por acesso e exclusão lógica **antes** de chamar as regras puras `subjectPublications` e `hasUnseenPublications`. Módulos retirados não contribuem com materiais/atividades descendentes; publicações retiradas não aparecem em IDs ou contagens. O modelo/contrato vigente usa turma/disciplina para o público dos avisos; nenhum campo de audiência novo foi inventado.

Somente administrador cria/edita dados da disciplina e equipe. Seleção docente explícita admite apenas IDs únicos de contas docentes ativas, até 100; seleções indisponíveis legadas continuam visíveis e removíveis, sem poda silenciosa ao consultar. Nome aceita 1–100 caracteres após validação de texto, descrição até 10.000 e título de módulo até 160. Campos, IDs, ícones, cores, filtros, ordenações e revisões são validados. Corpo do navegador nunca fornece autoria, ID, revisão nova ou callbacks.

Docentes atribuídos e administradores podem criar/editar módulos em turma ativa. Cada criação acrescenta ordem a partir do estado mais recente e avança a revisão estrutural do pai. Reordenação exige revisão do pai e de **todos** os filhos vivos, sem repetição, omissão ou ID estrangeiro. A validação de acesso vem antes dos metadados de revisão. Conflito ou falha de persistência conserva conjunto, ordens, revisões, auditoria e idempotência. `page` e `pageSize` paginam apenas a resposta da reordenação, cujo corpo continua sendo o conjunto completo; `sort` não é parâmetro desse comando. Nenhum limite arbitrário impede reordenar um conjunto que o serviço permitiu criar.

`GET /modules` é paginado; `GET /modules/{id}` permite conferir a edição em conflito. Encerramento da turma preserva consulta/visita da equipe atribuída, mas nega novas escritas de conteúdo; aluno perde o contexto. Retirada da atribuição entre abertura e gravação bloqueia o salvamento sem expor metadados de conflito. Não foram implementados comandos de retirada de disciplina/módulo, ausentes do comportamento legado e do escopo final.

## Visita por identidade observada

`GET /subjects/{id}/visits` retorna `{ subjectId, seenAt, seenPublicationIds, publicationIds, hasUpdates }`, com `seenAt` nullable. O POST recebe somente `{ publicationIds }` observados pelo cliente e chave de intenção. O serviço valida que os IDs pertencem às publicações vivas/visíveis daquele contexto e une as observações anteriores da **mesma conta/disciplina**. Não aceita usuário ou instante do navegador.

Uma publicação que surge entre GET e POST não é marcada por acidente. Duas sessões da mesma conta compartilham a leitura persistida; outra conta permanece independente. Editar/reordenar um módulo não cria nova identidade de publicação. Replay usa o estado autorizado atual: uma publicação surgida depois do primeiro commit continua com indicador de novidade, em vez de reutilizar uma resposta antiga que o apagaria. Conta sem acesso não recebe o replay. Timestamp antigo da massa pode ser preservado como último instante conhecido; na falta de snapshot de IDs, não se presume que todas as publicações atuais foram vistas.

O contexto privado do callback `replayProject` passou a incluir um quarto argumento `{ targetId, timestamp }`, compatível com callbacks existentes de três argumentos. Isso permite reconstituir a página atual de reordenação sem persistir campos privados extras no DTO ou usar estado global por requisição. A autorização continua ocorrendo antes da projeção/repetição.

## ECC TDD observado

Comando: `node --experimental-strip-types --test tests/http-subjects.test.mjs`.

- RED antes de produção: **7/7 falharam**, com rotas ausentes (`404 !== 200/201/500/422`), indicador de visita ausente e detalhe sem módulos. Os testes permaneceram na árvore.
- Após implementação inicial, **6/7 PASS**; replay da reordenação apresentou RED `500 !== 200`, pois faltava contexto do alvo para a projeção. O quarto argumento privado resolveu o caso; **7/7 PASS**.
- Regressão de query da reordenação: `node --experimental-strip-types --test --test-name-pattern='strict query' tests/http-subjects.test.mjs` apresentou RED `200 !== 422` para `?sort=id`. Corrigida a aceitação para somente page/pageSize; GREEN 1/1.
- Suite final ampliada: **8/8 PASS**, zero falhas/skips. Em conjunto com `tests/http-consistency.test.mjs`: **21/21 PASS**, zero falhas/skips.

Casos reais de HTTP: perfis e IDs diretos; projeção sem gabarito/segredo/draft pessoal; criação de disciplina idempotente; equipe ativa e recuperação de seleção indisponível; colaboração e edição concorrente por dois docentes com cookies independentes; revogação durante edição; filho stale, estrangeiro, conjunto preservado e criação concorrente invalidando revisão do pai; paginação da resposta da reordenação; visitas em dois navegadores simulados por sessões independentes; publicação entre leitura/gravação e após commit; replay atual e negação após revogação; rollback de módulo/pai/visita/auditoria/intenção; rejeição de corpo/query extras, aliases de caminho e endpoints de retirada fora do escopo; exclusão lógica de fontes e pais antes de computar contagens/identidades.

Gates globais, atualização do contrato, integração visual, teclado/responsividade, Graphify e revisão independente final são registrados pelo coordenador. Não há medição percentual de cobertura. Esta evidência não conclui as jornadas de material, atividade ou aviso das próximas issues.
