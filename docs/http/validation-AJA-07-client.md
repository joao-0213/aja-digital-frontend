# AJA-07 — disciplinas, módulos e visitas no cliente

Base: `a7d5ca4`. Este registro cobre a feature `subjects`, seus adapters HTTP, a construção do comando de ordem e a leitura/gravação de visitas. O agente principal consolida API, navegador, revisão independente e gates completos da issue.

## Estrutura e contratos

Aplicados ECC TDD/verification-loop, `AGENTS.md`, `ARQUITETURA.md`, skill `arquiteto-nextjs` e orientações locais Next.js sobre static export e Server/Client Components. Rotas continuam composição com Suspense. A feature consulta API no navegador e não monta transporte/mock/provider institucional anterior.

`SubjectSummary` contém classe legível, autores docentes mínimos, permissão de gestão, indicador e IDs das publicações autorizadas. `SubjectDetail` contém essa summary, todos os módulos vivos ordenados (sem corte arbitrário de 100) e contagens autorizadas separadas de materiais, atividades e avisos. Não contém respostas, gabaritos, tentativas alheias ou coleção institucional completa. Escritas retornam o recurso base; inspeção de conflito de disciplina transforma `GET detalhe → detail.subject`.

Card não consulta `useApp().db` nem executa uma consulta por card. Seu indicador vem da summary HTTP. Props adicionais opcionais preservam compatibilidade de tipos com os painéis ainda protegidos pelo guard da AJA-16, sem habilitar leitura de dados antigos. O hook de visitas não lê, escreve ou apaga `aja-subject-seen:*`.

## TDD e verificações observadas

- Adicionado `tests/subjects-client.test.ts` antes dos novos módulos. `node --experimental-strip-types --test tests/subjects-client.test.ts`: RED, exit 1, `ERR_MODULE_NOT_FOUND` de `src/features/subjects/api.ts`. Esse RED é ausência da implementação; ainda não executava os casos individualmente.
- Após implementar adapter e comando imutável de ordem: mesmo comando GREEN, 3/3. Casos verificam conjunto completo e revisão do pai/de cada módulo; limites de movimento e IDs repetidos; HTTP real em porta efêmera para campos graváveis/filtros/ordem; publicação que chega depois do snapshot permanece não lida; falha de visita não produz confirmação local e repetição conserva intenção/snapshot.
- Execução `node --experimental-strip-types --experimental-test-coverage --test tests/subjects-client.test.ts tests/teaching-team.test.ts tests/administration-client.test.ts tests/session-client.test.ts`: 30/30 passaram. Inclui conservação de seleção docente indisponível, edição compartilhada, buffer da mesma sessão, revogação e infraestrutura HTTP previamente testados. Não substitui testes da API real da AJA-07.
- Cobertura nessa execução: `module-order.ts` 100% linhas/funções, 91,67% branches; `subjects/api.ts` 87,5% linhas, 46,67% branches, 54,55% funções. O agregado de 59,8% linhas inclui módulos de domínio legados carregados indiretamente por testes de equipe, não é cobertura do produto completo. Hooks e componentes React não foram montados por estes testes Node.
- `npx.cmd tsc --noEmit`: exit 0. `npm.cmd run check:architecture`: exit 0, 165 módulos, sem ciclos estáticos e fronteiras preservadas. Nenhum build, Graphify, commit ou processo dev foi iniciado por este agente.

## Comportamento e preservação

Lista usa busca, turma e paginação da API. Alteração de query string é aplicada sem conservar o filtro de outra URL. Classes e docentes dos seletores percorrem todas as páginas autorizadas; dados de outras features são consumidos por entrada pública quando aplicável. Turmas encerradas continuam identificadas como inativas. Admin cria/edita disciplina/equipe/ícone; demais atores não recebem esses controles.

Editor de disciplina e módulo reutiliza `useHttpEditor`, `RecordConflict` e composição em memória do `SessionClient`: campos e revisão aberta sobrevivem à falha transitória da mesma sessão verificada. 409 exige inspeção/conferência explícita; nome, descrição, turma, equipe e ícone atuais são apresentados para comparação. Docente selecionado localmente que saiu da lista permanece visível e removível. Reconhecer revisão não o reinsere automaticamente nem permite salvar enquanto indisponível.

Detalhe preserva tabs Mural / Materiais e atividades, links por query string, índice `#module-<id>`, recolher/expandir módulos e controles de organização. Gestão depende de `canManageContent` do serviço. Turma encerrada conserva consulta/visita para equipe autorizada, sem comandos de conteúdo. Mural, materiais e atividades das issues seguintes mostram indisponibilidade explícita e apenas contagens autorizadas; componentes legados desses domínios não são importados pelo detalhe migrado. Nenhuma publicação é simulada ou confirmada localmente.

Movimento de módulo captura revisão da disciplina e de todo o conjunto de módulos observado. Não altera a lista otimisticamente; após sucesso busca detalhe completo, sem substituir o conjunto por resposta paginada de comando. Em conflito mantém a sequência anterior, consulta uma prévia da ordem atual e exige conferência. A conferência não repete o movimento; o próximo gesto usa uma nova revisão observada. Se a consulta de conflito falha, o botão de conferência não reconhece uma revisão inexistente.

Visita é enviada somente após GET autorizado e montagem do detalhe, com cópia de `publicationIds` observados e chave de intenção estável por sessão/disciplina/snapshot. Não usa relógio do navegador nem usuário informado no corpo. Enquanto pendente/falha, o indicador conserva a informação recebida da API; somente sucesso HTTP reconhece o resultado. Repetir mantém a mesma intenção e IDs. Resposta com `hasUpdates: true` continua mostrando novidades, inclusive quando outra publicação chegou entre GET e POST. Não há atualização otimista dos indicadores de outras contas.

## Validação complementar necessária

Agente principal executará os endpoints reais e browser com duas sessões docentes, revogação durante edição, aluno de outra turma, visitas da mesma conta em outro navegador versus conta diferente, repetição e falha de rede, teclado/foco e larguras de tela. Esses resultados devem constar do registro principal; esta nota não os presume.

As duas rotas da feature só serão habilitadas no guard do shell após a API correspondente ser verificada. Domínios posteriores continuam aguardando suas issues, preservando o escopo integral da migração.
