# AJA Digital | Migração integral do front-end para HTTP

**Entrega final.** Aluno, docente e administrador entram com suas próprias contas e usam o AJA Digital como produto. Uma publicação feita pelo docente aparece para o aluno em outro navegador. Todos os dados institucionais vêm de endpoints HTTP servidos por um JSON Server com massas preparadas. A interface usa linguagem de produto, inclusive quando uma operação falha.

**Como executar.** Cada título abaixo é uma issue copiável. Em um chat do repositório, peça, por exemplo, “Execute a issue AJA-01 de ISSUES-FRONTEND-HTTP.md, incluindo os critérios comuns de conclusão”. Execute na ordem numérica ou respeite os pré-requisitos indicados. Os caminhos são relativos à raiz. Marque as caixas somente depois de produzir a evidência correspondente.

## Decisões que valem para todas as issues

1. **Contrato público.** O navegador conversa com uma única API sob `/api/v1`. A implementação inicial usa JSON Server em processo separado do Next.js. Rotas de comando no mesmo processo cuidam de operações como concluir tentativa e encerrar turma. Futuramente, o BFF do diagrama pode assumir esse contrato e distribuir chamadas aos serviços Core e Questões. Gateway, serviços Kotlin, bancos PostgreSQL, RabbitMQ e entrega externa de e-mail ficam para a integração real.
2. **Origem dos dados.** O cliente recebe somente os recursos e campos permitidos para a sessão. Ações de negócio passam por HTTP, inclusive leitura, progresso e envio de arquivos. Estado visual, preferência de menu e recuperação temporária de texto podem ficar no navegador, isolados por conta e contexto. A API decide se uma publicação, envio ou alteração foi efetivada.
3. **Transição.** Desenvolver em incrementos integrados, mantendo a versão atual disponível até o aceite final. Ao migrar um recurso, apontar todas as suas escritas para o serviço e adaptar os leitores necessários. Validar fatias parciais em ambiente de desenvolvimento. Evitar gravar em duas bases, combinar snapshots divergentes ou preencher a tela com o seed após falha de rede. A entrega publicada usa exclusivamente HTTP.
4. **Compatibilidade.** Preservar as ações, permissões, relações, históricos, links por query string, âncoras, limites de arquivos, idioma e estados de edição já existentes. Manter exportação estática, entradas públicas de features e Suspense. Atualizar instruções de manutenção que exigem rótulos de demonstração, transporte local e atrasos artificiais para refletir este escopo.
5. **Apresentação.** Dados fictícios e instruções para acessar as contas ficam na massa e no guia do operador. A interface não oferece troca de persona, reset da base, injeção de falhas ou exploração sem login. Manter termos pedagógicos legítimos como “simulado”. Descrever ações pelo estado comprovado pela API, especialmente em confirmação de e-mail e recuperação de acesso.

### Critérios comuns de conclusão

- Cada issue de domínio entrega **endpoint, integração da tela e teste**, com exemplos de requisição e resposta no contrato. Verificar diretamente a resposta HTTP com os perfis pertinentes. Bloquear leitura, escrita e acesso por URL fora do escopo do ator.
- Nas telas, exercitar carregamento, vazio, indisponibilidade, repetição e sucesso após recarga. Uma resposta antiga não pode aparecer após trocar filtro ou conta. Em edição compartilhada, preservar o texto em caso de falha, exigir conferência da nova revisão e verificar revogação durante a edição.
- Para mudanças de regras, sessão, dados ou persistência, escrever testes de sucesso, negação, limites, falha e preservação. Incluir as novas suítes no comando de testes. Usar duas sessões independentes para concorrência. Registrar resultados efetivos de `npm test`, `npm run typecheck`, `npm run check:architecture` e `npm run build`. Se necessário, testar também o build Webpack e distinguir os resultados. Seguir `VALIDACAO.md` em mudanças de UI.
- Seguir `AGENTS.md` para Git, grafo e documentação local do Next.js. Revisar o diff, fazer commit focado, registrar hash e limites de cobertura. Dados de execução, arquivos enviados, credenciais reais e saídas de build ficam fora do Git.

## Fundação

### AJA-01 · Fixar o contrato e a matriz de migração
**Depende de** nenhuma. **Entrada** `ARQUITETURA.md`, `src/app/`, `src/features/`, `src/models/database.ts`, `src/providers/app-context.ts`, `src/lib/access.ts`, `src/lib/demo-mutations.ts`, testes de domínio.

Concluída no commit `e1bade7`, branch `feat/frontend-http`, revisão inicial `e169df6`. Evidências e limites em [docs/http/validation-AJA-01.md](docs/http/validation-AJA-01.md). Revisão independente APPROVE, OpenAPI válido, 851 exemplos sem erros e gates aprovados; limites documentados.

- [x] Versionar um contrato OpenAPI e uma matriz **rota → ação → perfil → operação HTTP → issue**. Usar o índice de rotas ao fim deste documento. Incluir ações dentro de diálogos, shell, mural e ferramentas de estudo. Diferenciar DTOs de leitura por perfil, campos graváveis e metadados controlados pelo servidor.
- [x] Definir IDs, paginação, filtros, ordenação estável, nulidade, datas civis e instantes, fuso de Brasília, anexos, exclusão lógica, revisão e repetição de comandos. Padronizar erros com código estável e mensagem PT-BR. Documentar 401 para sessão ausente, 403 para operação vedada, 404 para recurso inexistente ou oculto, 409 para conflito e 422 para entrada inválida.
- [x] Inventariar cada chave de navegador, IndexedDB, sessão, rascunho e relógio fixo. Classificar destino e titular dos dados. A instalação nova começa com a massa. Dados locais existentes permanecem intactos e não são enviados automaticamente ao serviço compartilhado. Descrever como manter acesso à versão anterior ou exportar uma cópia antes do corte.
- [x] Atualizar as regras do projeto sobre a transição. **Aceite** cada uma das 22 rotas tem dono e operações, cada coleção tem destino (inclusive `audit` e `events` legados), cada ação de escrita tem ator e regra de falha.

### AJA-02 · Subir o JSON Server com persistência reproduzível
**Depende de** AJA-01. **Entrada** `package.json`, `package-lock.json`, `scripts/preview.mjs`, `.gitignore`.

Concluída no commit `88b40db`, a partir de `e1bade7`, revisão independente APPROVE. Evidências e limites em [docs/http/validation-AJA-02.md](docs/http/validation-AJA-02.md): 137/137 testes, instalação isolada, scripts exercitados, gates aprovados; Linux não executado.

- [x] Criar `server/` e fixar no lockfile a versão do JSON Server com suporte ao uso como módulo. Referência de implementação: [documentação da versão 0.17.4](https://github.com/typicode/json-server/tree/v0.17.4#module). Usar a API da versão escolhida, com handlers no mesmo processo para regras de negócio.
- [x] Entregar `npm run api`, `npm run api:reset` e `npm run dev:full` para Windows e Linux. Reservar 3000 para o front, 3001 para a prévia e 3002 para a API por padrão. Adicionar exemplo de configuração da URL pública, origens permitidas e comando de saúde. Inicializar cópia gravável só se ausente. Reset explícito via terminal, restrito à pasta de execução.
- [x] Servir somente operações públicas documentadas. Bloquear acesso direto a `/db`, coleções brutas, credenciais, arquivos privados, caixa de mensagens e rotas de manutenção. Desabilitar rotas padrão ou caminhos alternativos que contornem essa restrição.
- [x] **Aceite** em checkout limpo, instalar com `npm ci`, iniciar, consultar saúde, persistir um registro de teste, reiniciar e reler. Reset recompõe o estado inicial. Testes usam diretório e porta isolados. Build do front funciona com a API desligada.

### AJA-03 · Preparar massas com jornadas completas por perfil
**Depende de** AJA-02. **Entrada** `src/mocks/`, `src/models/`, `public/questions/`, exemplos e regras em `tests/`.

Concluída nos commits `d51327e` e `683137b`, a partir de `88b40db`, revisão independente APPROVE e 141/141 testes. Evidências e limites em [docs/http/validation-AJA-03.md](docs/http/validation-AJA-03.md).

- [x] Entregar seed versionado, arquivos pequenos válidos para abrir/baixar e guia de acesso do operador. Incluir administrador, dois docentes da mesma disciplina, docente sem atribuição, aluno matriculado, aluno sem turma, matrícula pendente, conta inativa e turma encerrada. Usar identidades fictícias e credenciais exclusivas do ambiente local.
- [x] Ligar turmas, disciplinas, equipe, módulos, texto/PDF/vídeo, progresso, questões do acervo e autorais, atividade em rascunho/publicada, tentativa em andamento/enviada, trabalho com retorno em rascunho/publicado, fórum com referência/anexo/solução, avisos, acontecimento e chamada. Disponibilizar contexto vazio e contexto com acesso negado. Preservar links estáveis como a disciplina `s1`.
- [x] Gerar datas relativas a uma data-base de inicialização, com opção explícita de data fixa em testes. Incluir prazos futuros, encerrados e sem prazo. O relógio do produto usa o dia corrente. Reiniciar o servidor conserva prazos e alterações.
- [x] **Aceite** teste de integridade verifica IDs únicos, vínculos, referências, gabaritos, revisões e disponibilidade de binários. Dois resets com a mesma data-base reproduzem os mesmos cenários de negócio. O guia permite percorrer “docente publica → aluno entrega → docente devolve → aluno consulta” sem cadastro manual prévio.

### AJA-04 · Compartilhar transporte, controle de acesso e gravação consistente
**Depende de** AJA-02, AJA-03. **Entrada** `src/mocks/api.ts`, `src/hooks/use-mock-query.ts`, `src/lib/demo-mutations.ts`, `src/lib/access.ts`, `src/components/shared/record-conflict.tsx`.

Concluída no commit `43549c1`, a partir de `683137b`: 164/164 testes, revisão independente APPROVE e gates aprovados. Evidências e limites em [docs/http/validation-AJA-04.md](docs/http/validation-AJA-04.md). Sessão real e telas são entregas seguintes.

- [x] Criar cliente HTTP tipado com URL configurável, sinal de cancelamento, leitura de respostas vazias/binárias e erros tipados. Conectar carregamento, nova tentativa e invalidação às requisições efetivas. Limpar dados da sessão anterior e descartar respostas obsoletas. Verificar com servidor em porta de teste.
- [x] Criar no serviço o ponto comum para resolver o ator, projetar campos autorizados, revalidar vínculos e comparar revisões durante a gravação. Reaproveitar regras puras. Para comandos com vários registros, serializar a validação e a gravação no mesmo estado, incluindo auditoria. Uma falha preserva o estado anterior. Vincular repetições de operações de envio ao ator e à operação.
- [x] **Aceite** testes HTTP com atores controlados cobrem 403 por ID direto, edição concorrente (uma gravação e um 409), acesso revogado antes do commit, falha de persistência e repetição após perda da resposta. O cliente distingue sessão expirada, conflito e API indisponível. AJA-05 liga os atores à sessão real do serviço local.

### AJA-05 · Migrar identidade, sessão, perfil, privacidade e shell
**Depende de** AJA-04. **Entrada** features `auth`, `profile`, `privacy`, `src/components/layout/`, `src/components/providers.tsx`, `src/providers/`.

Concluída no commit `fba87ee`, a partir de `43549c1`: 185/185 testes, gates e revisão independente APPROVE. Evidências em [docs/http/validation-AJA-05.md](docs/http/validation-AJA-05.md). Exportação anterior preservada separadamente; identidade HTTP não mistura dados legados.

- [x] Implementar cadastro, login, sessão atual e logout, confirmação de e-mail e recuperação com token de uso único no JSON Server. Usar cookie de sessão HttpOnly, expiração, origens explícitas e controle de origem nas escritas. Guardar verificador de senha só no serviço. Uma caixa de saída local acessível ao operador pelo terminal permite completar os fluxos sem provedor externo.
- [x] Migrar `/login`, `/cadastro`, `/recuperar-senha`, `/perfil`, entrada protegida e saída. Cobrir alteração do nome e consulta dos vínculos. Substituir conta pré-selecionada, senha preenchida, seleção de papel, checkbox de dados fictícios, entrada sem login e painel de controles por sessão obtida via HTTP. Atualizar aviso de privacidade conforme os dados e as funções disponíveis.
- [x] **Aceite** testar senha incorreta, cadastro duplicado, recuperação com resposta neutra, token inválido/expirado/reutilizado, login após redefinição, logout seguido de “voltar”, usuário inativado e recarga. Uma sessão nova não herda dados da anterior. Papel informado no corpo ou no navegador não concede acesso. Texto de confirmação distingue solicitação aceita de entrega de e-mail.

## Migração das jornadas

Os caminhos abaixo são operações propostas sob `/api/v1`. AJA-01 fixa os nomes e formatos. Cada issue registra no contrato as operações auxiliares necessárias à jornada.

### AJA-06 · Migrar usuários, turmas, alunos e matrículas
**Depende de** AJA-05. **Entrada** features `users`, `classes`, `students`, `src/lib/enrollment.ts` e testes de permissões/matrículas.

Concluída a partir de `fba87ee`: 217/217 testes, tipos, arquitetura (161 módulos), build padrão Turbopack (24 páginas), OpenAPI (79 caminhos/858 exemplos), navegador em sessões independentes e prévia estática aprovados. Revisão independente APPROVE, sem achados pendentes. Evidências e limites em [validation-AJA-06.md](docs/http/validation-AJA-06.md).

- [x] Integrar listagem e detalhe, cadastro/edição de docentes, gestão de cargos, inativação, exclusão lógica, cadastro/edição/encerramento de turma e perfil do aluno. Usar recursos `/users`, `/classes`, `/students` e comandos de `/enrollments` para inclusão por e-mail, efetivação, cancelamento e saída. Ligar confirmação de AJA-05 e status no perfil/painel ao mesmo vínculo.
- [x] **Aceite** proteger último administrador ativo e escopo docente. Uma confirmação repetida não cria novo vínculo. Encerrar turma cancela pendências e encerra vínculos no mesmo comando. Preservar autoria e histórico, turmas legadas ambíguas e atividades vencidas antes do ingresso. Reutilizar e-mail de outra conta não transfere matrícula. Validar em duas sessões.

### AJA-07 · Migrar disciplinas, equipe, módulos e visitas
**Depende de** AJA-06. **Entrada** feature `subjects`, `src/lib/subject-updates.ts`, testes de equipe e atualizações.

Concluída e revisada a partir de `a7d5ca4`; evidências em [validation-AJA-07.md](docs/http/validation-AJA-07.md).

- [x] Implementar `/subjects`, detalhe por ID, atribuição de docentes, comandos de criação/edição/ordenação de módulos e leitura/gravação de última visita por usuário. Migrar filtros por turma, cards, abas, âncoras e indicadores de novidades. Definir no detalhe as projeções consumidas por mural, materiais e atividades nas issues seguintes.
- [x] **Aceite** dois docentes atribuídos colaboram na mesma disciplina. Remover um durante a edição impede salvar. A reordenação verifica os dois registros e preserva o conjunto no conflito. Aluno vê só disciplinas da turma. Visita em outro navegador atualiza o indicador da mesma conta sem marcar a disciplina para outro usuário.

### AJA-08 · Disponibilizar arquivos por HTTP e migrar materiais e progresso
**Depende de** AJA-07. **Entrada** feature `materials`, detalhe da disciplina, `src/lib/material-files.ts`, `src/lib/material-video.ts`, `src/hooks/use-study-tools.ts`.

Concluída a partir de `25c823f`: 254/254 testes, tipos, arquitetura (171 módulos), build padrão com API desligada, OpenAPI (839 exemplos), binário/SHA-256, sessões independentes, teclado e export estático aprovados. Revisão Sol independente APPROVE após correções Terra, sem achados pendentes. Evidências e limites em [validation-AJA-08.md](docs/http/validation-AJA-08.md).

- [x] Implementar upload, metadados e download autenticado em `/files`, com limites por uso, MIME, tamanho, nome seguro e autorização pelo recurso pai. Usar área de preparação para publicação em lote e limpar arquivos órfãos em falha. Servir bytes apropriados a prévia/download. Compartilhar o mecanismo com trabalhos e fórum.
- [x] Migrar publicação em lote, edição, ordenação e leitura em `/materials`. Preservar texto, PDF, vídeo externo por escolha e retorno ao módulo. Registrar conclusão e último acesso em `/me/progress`. Conectar as ferramentas opcionais `read_study_materials` e `complete_study_material` aos mesmos serviços.
- [x] **Aceite** docente envia PDF em um navegador, aluno autorizado abre em outro e conclui o material. Arquivo ausente, ID adivinhado, lote parcialmente inválido, vídeo legado sem URL e repetição de conclusão têm resultados verificáveis. Inspecionar resposta e binário. A tela continua utilizável sem suporte às ferramentas opcionais.

### AJA-09 · Migrar o banco de questões e a prática individual
**Depende de** AJA-05. **Entrada** feature `questions`, `src/lib/question-composition.ts`, `src/mocks/questions.ts`, imagens em `public/questions/`.

Concluída a partir de `2898cf0`: 257/257 testes, tipos, arquitetura (175 módulos), build padrão com API desligada, OpenAPI e navegador estático aprovados. Revisão Sol independente APPROVE, sem achados pendentes. Evidências e limites em [validation-AJA-09.md](docs/http/validation-AJA-09.md).

- [x] Expor pesquisa, filtros, paginação, detalhe e resolução de prática em `/questions`. Conectar lista, diálogo, link copiado e seletor compartilhado com o construtor. Questões autorais restritas à atividade ficam fora dos resultados do acervo.
- [x] **Aceite** filtros combinados e paginação retornam total e itens coerentes. Recarga de `/questoes?id=…`, volta à busca, imagem com descrição, resolução e ID retirado funcionam. A resposta de prática e a de uma tentativa avaliativa têm contratos distintos.

### AJA-10 · Migrar a autoria e a publicação de atividades
**Depende de** AJA-07, AJA-09. **Entrada** `assessments-page.tsx`, `assessment-builder.tsx` e `lib/assessment-editor.ts` na feature `assessments`.

Concluída a partir de `a7ff570`: 271/271 testes, tipos, arquitetura (178 módulos), build padrão com API desligada, OpenAPI (830 exemplos sem erros) e navegador estático aprovados. Revisão Sol independente APPROVE, sem achados pendentes. Evidências e limites em [validation-AJA-10.md](docs/http/validation-AJA-10.md).

- [x] Implementar lista/detalhe em `/assessments` e comandos de salvar rascunho, editar e publicar quiz ou trabalho. Conservar obrigatoriedade, prazo, tolerância a atraso, módulo, ordem, questões do banco e autorais. Salvar cópias das questões no ato previsto pelas regras atuais.
- [x] **Aceite** docente prepara, fecha, reabre e publica. Aluno recebe apenas atividades visíveis. Alterar o acervo depois não reescreve uma avaliação anterior. Testar conflito entre professores, vínculo revogado, duplicata, gabarito inválido e bloqueio de mudança estrutural após primeiro envio. As abas da disciplina refletem a publicação.

### AJA-11 · Migrar tentativas, retomada e resultado individual
**Depende de** AJA-10. **Entrada** `quiz-session.tsx`, `answer-assessment.tsx`, `assessment-result.tsx`, `src/lib/assessment-attempts.ts`.

Concluída a partir de `e3689c0`: 298/298 testes, tipos, arquitetura (179 módulos), OpenAPI (830 exemplos sem erros), build padrão com API/dev desligados e navegador estático aprovados. Revisão Sol independente APPROVE, sem achados pendentes. Evidências e limites em [validation-AJA-11.md](docs/http/validation-AJA-11.md).

- [x] Implementar início, consulta, salvamento de respostas, finalização e resultado de `/attempts`. Capturar ordem e conteúdo, preservar respostas em branco e verificar condição de atribuição/prazo no serviço. Guardar gabarito e cálculo da nota no serviço até a fase autorizada. Recuperação de digitação deve respeitar usuário, tentativa e revisão.
- [x] **Aceite** iniciar em um navegador e retomar respostas já salvas em outro. Duplo envio ou perda da resposta produz um único comprovante/resultado. Após entrega, impedir edição. Testar prazo de Brasília na virada, atividade sem prazo, revisão das questões, campos da resposta antes/depois da entrega e consulta ao resultado de outro aluno.

### AJA-12 · Migrar entregas de trabalho e devolutivas
**Depende de** AJA-08, AJA-10. **Entrada** `work-activity.tsx`, `work-attachments.tsx`, `feedback-editor.tsx`, `src/lib/activities.ts`.

Implementada e validada. A revisão independente Sol identificou três defeitos MEDIUM; as correções foram revalidadas pelo mesmo revisor, com **APPROVE e zero achados pendentes**. RED/GREEN, jornada de navegador, gates e limites estão registrados em `docs/http/validation-AJA-12.md`.

- [x] Implementar consulta/preparação e envio de `/submissions` com arquivos ou links, data e comprovante. Integrar rascunho docente, nota, comentário, publicação e revisão do retorno individual. Preservar histórico e a distinção entre salvar e publicar.
- [x] **Aceite** testar entrega única, recarga de comprovante, anexo inválido e tentativa de reutilizar arquivo de outro aluno. Falha antes do commit permite repetir sem entrega vazia. Aluno recebe apenas seu retorno publicado. Dois docentes não sobrescrevem devolutivas concorrentes. Verificar acesso direto com `?entrega=`.

### AJA-13 · Migrar avisos, mural e calendário
**Depende de** AJA-07, AJA-10. **Entrada** features `announcements`, `calendar`, mural de `subjects`, `src/lib/announcement-calendar.ts`.

- [ ] Implementar `/announcements` e `/calendar`. Reutilizar o compositor nos dois murais, preservar público, acontecimento opcional, dia inteiro, revisão, retirada e opção de notificação. Registrar solicitação de notificação na caixa local. Calendário e próximos encontros derivam dos avisos e prazos visíveis.
- [ ] **Aceite** publicar um aviso contextual em uma sessão e localizá-lo na data e origem corretas em outra. Editar, retirar e remover o acontecimento atualizam calendário e mural sem duplicar eventos legados. Preservar rascunho em falha; respeitar escopo durante retomada. Usar data corrente em vez de outubro de 2026.

### AJA-14 · Migrar fórum, anexos e referências contextuais
**Depende de** AJA-08, AJA-09. **Entrada** feature `forum`, `src/lib/forum.ts`, `src/lib/forum-draft.ts`, testes de fórum.

- [ ] Implementar `/topics`, detalhe e comandos para perguntar, responder, marcar leitura, votar, indicar solução e retirar publicação. Preservar busca no texto das respostas, ordenação, referência por ID a questão/material, anexos e formatos legados. Recuperar composição por usuário e contexto.
- [ ] **Aceite** duas respostas concorrentes permanecem presentes. Repetir voto/leitura mantém o efeito previsto. Nova resposta renova indicação de não lida aos demais. Retirar resposta escolhida desfaz a solução e preserva auditoria. Turma encerrada continua consultável pela equipe autorizada com marcação de leitura, sem novas publicações. Aluno perde acesso, inclusive aos arquivos.

### AJA-15 · Migrar chamada e histórico de frequência
**Depende de** AJA-06, AJA-07. **Entrada** feature `attendance`, `src/lib/attendance.ts`, testes de frequência e matrícula.

- [ ] Implementar consulta de elegíveis e gravação da chamada em `/attendance` por disciplina, data e horário. Preservar marcação em lote, conferência, edição e histórico no perfil autorizado. Identificar univocamente a aula e verificar revisão ao gravar.
- [ ] **Aceite** criar e reabrir a chamada em sessões distintas. Duas criações para a mesma aula não duplicam presença. Comparar marcações locais e salvas em conflito. Cobrir datas antes da matrícula e após saída, registros históricos sem data de vínculo, turma encerrada e docente desatribuído.

### AJA-16 · Conectar painéis e projeções entre domínios
**Depende de** AJA-06 a AJA-15. **Entrada** feature `dashboard`, painéis de aluno e equipe, detalhes em `students`, `subjects` e `profile`.

- [ ] Entregar `/me/dashboard` ou consultas por seção com os mesmos limites de acesso. Integrar progresso, retomada, pendências de matrícula, atividades, avisos, encontros e indicadores já apresentados. Usar horário corrente e estados vazios úteis. Completar cada resumo, mural e link cruzado da matriz AJA-01.
- [ ] **Aceite** publicar como docente, consumir como aluno e conferir as atualizações no painel e no destino do link. Testar aluno sem turma, docente sem disciplina, administrador e acesso revogado durante consulta. Nenhum painel baixa a base inteira para calcular indicadores privados no navegador.

## Corte e aceite do produto

### AJA-17 · Retirar o transporte anterior e revisar toda a linguagem
**Depende de** AJA-16. **Entrada** `src/app/`, `src/components/`, `src/providers/`, `src/hooks/`, `src/features/`, `src/lib/`, `src/mocks/`, `public/`, documentação de uso.

- [ ] Remover do caminho de execução do cliente `useDemoState`, `mockRequest`, `useMockQuery`, relógio fixo, banco completo, callbacks genéricos `mutate(draft => …)`, Web Locks para dados institucionais e IndexedDB como repositório de anexos. Transferir fixtures e regras ainda necessárias aos testes/servidor. Reduzir `useApp` às responsabilidades de sessão e interface. Verificar que seeds/credenciais não entram em `out/`.
- [ ] Revisar textos, botões, diálogos, notificações, mensagens de erro, leitura por tecnologia assistiva, títulos, descrições, metadados, telas 404/carregamento, navegação móvel, rodapé, privacidade, ferramentas de estudo e conteúdo das massas visível ao público. Buscar variantes de “demo”, “demonstração”, “simulado”, “fictício”, “protótipo”, “apenas neste navegador” e equivalentes. Classificar ocorrências pelo significado. Remover qualquer apresentação do sistema como demonstração e preservar o sentido didático das questões.
- [ ] Atualizar README, arquitetura, instruções de manutenção e roteiro de validação vigente. Manter credenciais fictícias e reset apenas no guia técnico. Conferir o procedimento de corte de AJA-01 com um perfil de navegador antigo, incluindo chaves, rascunhos e blobs pré-existentes. Não importar identidades locais como sessões válidas nem apagar dados antigos no primeiro acesso.
- [ ] **Aceite** visitar as 22 rotas com API ativa e indisponível, procurar cópia residual no HTML, textos acessíveis e mensagens dinâmicas. Desconectar a API jamais gera sucesso local. Uma checagem automatizada impede voltar a importar seed/transporte de teste no front. Registrar a lista curta de exceções pedagógicas e armazenamento permitido.

### AJA-18 · Validar o produto completo e entregar o roteiro de operação
**Depende de** AJA-17. **Entrada** contrato HTTP, matriz AJA-01, guia da massa AJA-03, `VALIDACAO.md`.

- [ ] De um checkout limpo, instalar, preparar massa, executar site e API, gerar a exportação e servir `out/` contra uma instância de API configurável. Documentar configuração antes do build, origem pública da API e cookies/CORS para desenvolvimento e prévia. Verificar acesso por uma segunda sessão sem armazenamento anterior.
- [ ] Automatizar testes de contrato contra o processo real de JSON Server e jornadas de navegador sem interceptar os sucessos. Percorrer administrador atribui docente/matricula aluno → docente publica conteúdo/atividade → aluno consulta, responde e recebe retorno. Percorrer também recuperação de conta, frequência, calendário, fórum e revogação durante edição. Usar falhas controladas de teste para timeout, erro HTTP, conflito e upload interrompido.
- [ ] **Aceite de entrega** matriz completa por rota, operação e papel. Evidências de teclado, foco, telas de 390/768/1440 px, estados de rede e mensagens PT-BR. Anotar comandos, resultados, limitações, conta e cenário usados. Reexecutar os mesmos testes de contrato sobre outra URL deve ser possível para orientar a substituição futura pelo BFF.

## Índice de cobertura das rotas atuais

| Rotas do produto | Issues responsáveis |
| --- | --- |
| `/login`, `/cadastro`, `/recuperar-senha`, `/perfil` | AJA-05, AJA-06 |
| `/usuarios`, `/turmas`, `/alunos`, `/alunos/perfil` | AJA-06, AJA-15, AJA-16 |
| `/disciplinas`, `/disciplinas/detalhes` | AJA-07, AJA-08, AJA-10, AJA-13 |
| `/materiais` | AJA-08 |
| `/questoes` | AJA-09 |
| `/questionarios`, `/questionarios/criar` | AJA-10 |
| `/questionarios/responder`, `/questionarios/resultado` | AJA-11, AJA-12 |
| `/avisos`, `/calendario` | AJA-13 |
| `/forum`, `/forum/topico` | AJA-14 |
| `/frequencia` | AJA-15 |
| `/` | AJA-16 |

O shell, os provedores, a privacidade, as ferramentas de estudo, os estados globais, os metadados e a documentação têm aceite próprio em AJA-05, AJA-08, AJA-17 e AJA-18. A migração termina quando todas as linhas funcionarem a partir da massa preparada e de chamadas HTTP observáveis.
