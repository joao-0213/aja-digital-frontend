# Arquitetura do AJA Digital

PP08/revisão: `src/lib/forum-draft.ts` informa falhas de leitura/gravação sem substituir a composição anterior após recuperação malsucedida. Composições bloqueiam edição/descarte durante operações pendentes. Turmas encerradas ficam somente para consulta da equipe autorizada, incluindo marcação de leitura; aluno continua sem acesso e comandos de publicação/voto/solução/retirada permanecem recusados.

PP08: `src/lib/forum.ts` centraliza busca em respostas, ordenação cronológica com desempate por ID, resolução de referência por tipo/ID, limites de anexos e validação comum de comandos para todas as personas. Respostas usam metadados de exclusão; a projeção retira respostas excluídas e limita a lista de leitores à própria persona. Nova resposta renova `readBy` para os demais, sem alterar a ordem dos tópicos. Mutações usam o estado mais recente, preservam respostas/votos anteriores e auditam respostas sem copiar seu texto. Exclusão de resposta desmarca a solução e conserva o registro original. Questões legadas em `reference` continuam compatíveis; `target` distingue questão/material. Arquivos `forum-file-*` compartilham o IndexedDB local já usado por materiais e entregas. Composições de pergunta/resposta ficam na sessão, por usuário/contexto; publicação exige persistência local. Detalhes e limites em `docs/ESCOPO-PP08.md` e `output/reviews/VALIDACAO-PP08.md`.

PP07/R1: composições de avisos usam `sessionStorage` via `src/lib/announcement-draft.ts`, isoladas por usuário, criação/contexto ou ID da edição. Retomada conserva revisão aberta e não reconhece automaticamente uma versão concorrente. Descarte/publicação limpam a composição; restauração da demo limpa as chaves desse domínio. O rascunho de sessão não é publicação nem registro compartilhado do mock.

PP07: `src/lib/announcement-calendar.ts` valida acontecimentos e deriva o calendário dos avisos e dos prazos de atividades, aplicando o mesmo público das consultas. `AnnouncementComposer`, exposto por `@/features/announcements`, serve aos murais geral e contextual. `Announcement.occurrence` separa acontecimento de publicação; calendário e próximos encontros dos painéis não mantêm cópias. Edição usa revisão, autoria preservada e conferência de conflitos; publicação/edição/retirada exigem persistência local. `events` permanece somente como legado migrado e retirado, sem novos comandos de cadastro. Detalhes e limites em `docs/ESCOPO-PP07.md`.

PP06: `src/lib/activities.ts` centraliza prazo em horário de Brasília, envio único, anexos livres e retorno individual. `Assessment.kind` distingue questionário (ausência no legado) e entrega de trabalho; prazo vazio continua representando Sem prazo. `MockDatabase.submissions` é adicionado pela migração, preservando tentativas antigas e a chave da demo. `WorkSubmission` guarda anexos, comprovante e histórico de publicações; rascunho de retorno e publicação são campos separados. A projeção do aluno remove o rascunho e o histórico interno, entregando somente seu retorno publicado e a indicação de atualização. Mutações conferem vínculo, revisão, prazo e bloqueios após a primeira entrega contra o estado mais recente.

As telas em `src/features/assessments/components/` incluem composição por modalidade, preparação/conferência do trabalho, anexos e editor de retorno. As rotas `/questionarios` permanecem compatíveis, agora apresentadas como Atividades. Arquivos das entregas usam IDs `work-file-*` no armazenamento IndexedDB existente de arquivos locais; metadados e links ficam na demo. Prévia limitada a PDF/imagens suportadas; outros formatos têm download como binário. Restauração da demo limpa o mesmo armazenamento. Entrega e publicação de retorno exigem gravação local bem-sucedida antes de confirmar sucesso; isso continua uma simulação no mesmo navegador, sem serviço ou autenticação real.

PP05: `src/lib/question-composition.ts` resolve as cópias de questões em `Assessment.questions` e `Attempt.questions`. O acervo preparado permanece em `MockDatabase.questions`; autorais pertencem à atividade. `src/features/questions` expõe filtros compartilhados pelo banco e construtor. Migração local copia conteúdo legado antes de separar autorais, sem mudar a chave da demo. Links do banco/fórum usam `/questoes?id=<id>`; rotas permanecem estáticas e com Suspense.

O projeto organiza a interface em três camadas: elementos genéricos de UI, módulos de domínio e entradas de rota. Next.js App Router compõe as telas; React mantém as interações e os dados da demonstração no navegador. A exportação estática continua configurada em `next.config.ts`.

## Mapa para manutenção

| Responsabilidade | Localização |
| --- | --- |
| Rotas, metadados, Suspense, loading, error e 404 | `src/app/` |
| Controles e apresentação sem regras de domínio | `src/components/ui/` |
| Logo e notificações genéricas | `src/components/shared/` |
| Navegação e controles globais da demonstração | `src/components/layout/` |
| Composição do estado e das notificações | `src/components/providers.tsx` |
| Contrato `useApp()` | `src/providers/app-context.ts` |
| Estado, sessão e mutações simuladas | `src/providers/use-demo-state.ts` |
| Tipos compartilhados e contrato dos dados | `src/models/` |
| Dados iniciais e transporte simulado | `src/mocks/` |
| Regras puras e infraestrutura compartilhada | `src/lib/` |
| Visibilidade e permissões por contexto | `src/lib/access.ts` |
| Validação de comandos, revisões e auditoria local | `src/lib/demo-mutations.ts` |
| Matrícula por e-mail, confirmação simulada e recorte de entrada | `src/lib/enrollment.ts` |
| Revisão aberta nos editores e apresentação de conflitos | `src/hooks/use-record-revision.ts` e `src/components/shared/record-conflict.tsx` |
| Consulta simulada e integração com ferramentas de estudo | `src/hooks/` |

## Tipos compartilhados

Os modelos ficam separados por assunto em `src/models/`. `index.ts` mantém a entrada pública existente com `export type`, permitindo continuar usando `import type { User, Subject } from '@/models'`.

| Arquivo | Tipos |
| --- | --- |
| `user.ts` | `Role` e `User` (identificação mínima, estado de conta e metadados operacionais, sem foto ou documentos) |
| `academic.ts` | `SchoolClass`, `Subject` com `teacherIds`, `SubjectIcon` e `TrailModule` |
| `materials.ts` | `Material`, `MaterialKind` e `Progress` |
| `questions.ts` | `Question` e `Difficulty` |
| `assessments.ts` | `Assessment` e `Attempt` |
| `forum.ts` | `ForumTopic` e `ForumReply` |
| `announcements.ts` | `Announcement` |
| `calendar.ts` | `CalendarEvent` |
| `attendance.ts` | `Attendance` |
| `enrollment.ts` | `Enrollment`, pendências e ciclo dos vínculos com datas |
| `audit.ts` | `RecordMeta` e `AuditEvent` |
| `database.ts` | `MockDatabase`, que compõe os modelos dos outros arquivos |

Esses arquivos contêm somente tipos. Dependências entre modelos usam `import type` diretamente do arquivo responsável, mantendo a composição do banco em `database.ts` e evitando referências de volta ao índice público. Tipos específicos de apresentação continuam próximos dos componentes que os utilizam.

## Domínios

Cada módulo em `src/features/` expõe seus componentes compartilhados e entradas de tela por `index.ts`. Componentes e hooks internos ficam próximos do uso.

| Módulo | Rotas e responsabilidades |
| --- | --- |
| `auth` | `/login`, `/cadastro`, `/recuperar-senha` |
| `dashboard` | `/`, painéis fixos de aluno e equipe |
| `classes` | `/turmas`, cadastro e inativação de turmas |
| `subjects` | `/disciplinas`, `/disciplinas/detalhes`, gestão administrativa de disciplinas/equipe, cards, mural, módulos e visitas |
| `materials` | `/materiais`, leitura e publicação local de materiais |
| `assessments` | `/questionarios`, criação, resposta, recuperação e resultado |
| `questions` | `/questoes`, busca e resolução de questões |
| `forum` | `/forum`, `/forum/topico`, perguntas, respostas, votos e soluções |
| `calendar` | `/calendario` |
| `announcements` | `/avisos` |
| `profile` | `/perfil`, nome, e-mail, papel e matrículas do próprio usuário |
| `students` | `/alunos`, `/alunos/perfil`, inclusão por e-mail, pendências, histórico e confirmação retomável no painel/perfil |
| `privacy` | Aviso demonstrativo reutilizado no cadastro/login e no perfil, sem canal real de atendimento |
| `attendance` | `/frequencia` |
| `users` | `/usuarios`, cargos globais e cadastro, edição, inativação e exclusão lógica de docentes pela administração |

## Direção das dependências

- Rotas compõem entradas públicas de features e componentes genéricos.
- Uma feature importa seus arquivos internos diretamente. Integrações entre features usam `@/features/<domain>`; por exemplo, o painel usa `SubjectCard` de disciplinas, e disciplinas usa `MaterialComposer` de materiais.
- Features consomem o contrato `useApp()` de `@/providers/app-context`. A composição de `Providers` permanece no layout raiz para conservar o estado entre navegações.
- Elementos em `ui/` usam utilitários genéricos e outros elementos de UI por import direto. `shared/` pode compor `ui/`. Essas duas áreas não acessam features, contexto da aplicação nem mocks.
- Tipos, regras puras e infraestrutura não importam componentes ou rotas. Dependências circulares são proibidas.
- `components/ui/index.ts` é uma entrada de conveniência com exports explícitos. Ele não aplica uma fronteira cliente a todo o catálogo.

O comando `npm run check:architecture` verifica imports internos, essas fronteiras estruturais e ciclos nos imports e reexports estáticos de execução. Imports exclusivamente de tipos não participam dos ciclos. A checagem de tipos e o build continuam necessários para validar os contratos e as fronteiras do React/Next.js.

## Servidor e navegador

Páginas e layouts permanecem Server Components. Com `output: 'export'`, sua renderização de servidor acontece durante o build. Eles delegam a interatividade a componentes cliente e mantêm os fallbacks de Suspense usados pelas telas com query string.

Estado da demonstração, formulários, APIs do navegador, leitura de parâmetros pela interface e mutações simuladas continuam no cliente. Não há servidor de aplicação, Server Actions nem autenticação autoritativa. Um componente sem hooks ou handlers pode ser compatível com servidor; se importado por um componente cliente, participa desse grafo cliente.

## Contratos que devem ser preservados

- `useApp()`: dados projetados para o usuário, conta atual, perfil, `ready`, `busy`, troca de perfil, entrada, busca de conta para login simulado, mutação, notificação e restauração. A mutação aceita revisão esperada e comandos tipados de matrícula; ambos são conferidos no estado mais recente.
- `aja-digital-demo-v1`: banco serializado em localStorage, com versão e formato existentes. A validação e as chaves centrais vivem em `src/lib/demo-storage.ts`.
- `aja-demo-role`: perfil da demonstração em sessionStorage. O comportamento de entrada e troca de perfil continua definido pelo estado da demonstração.
- `aja-demo-user`: identificador da conta selecionada na mesma sessão, acrescentado pelo PP02 para distinguir docentes do mesmo cargo. Sessões antigas apenas com o papel continuam legíveis; uma conta selecionada que foi inativada ou excluída não é substituída silenciosamente por outra.
- `aja-attempt-<id>`: recuperação de respostas em sessionStorage, mantida na sessão do questionário.
- `aja-attempt-<id>:questions-updated`: marcador complementar para descartar a recuperação anterior quando o professor altera as questões e reinicia os rascunhos. A chave original de respostas permanece.
- `aja-subject-seen:<userId>:<subjectId>`: publicações visitadas, com sincronização pelo hook de disciplinas.
- Preferências antigas do painel `aja-dashboard-<id>` ficam inertes após PP01; o painel tem composição fixa. E-mail lembrado e IndexedDB `aja-material-files` mantêm seus formatos e comportamento atuais.
- Rotas de detalhes por query string, como `/disciplinas/detalhes?id=s1`, e todos os parâmetros, âncoras e links existentes.
- Ordem das mutações, latência e falhas do mock, salvamento automático, limpeza dos arquivos em falhas e mensagens de feedback.

## Redução do escopo — PP01

O [complemento de escopo](docs/ESCOPO-PP01.md) registra as histórias e diagramas incorporados ao DOCX acadêmico indicado pelo usuário. `demo-storage.ts` migra o banco local na mesma chave e versão, descartando atributos pessoais dispensados, documentos de adaptação, configurações de sorteio/tentativas e votos negativos. O banco migrado é regravado no carregamento, preservando contas, vínculos e registros compatíveis. Falha de regravação não impede restaurar o papel da sessão nem descarta o banco migrado em memória.

`assessment-attempts.ts` concentra início/retomada em ordem fixa e envio único, revalidando a regra dentro da mutação. Histórico antigo, respostas e ordens gravadas permanecem consultáveis. A consulta de materiais mantém índice, acesso direto, retorno à disciplina, última visita e conclusão individual, sem progresso agregado ou percurso automático. Votos positivos e solução permanecem no fórum, sem alterar a cronologia.

`study-order.ts` reúne comparação de instantes e seleção do último material acessado. Datas inválidas ficam no final da cronologia e não são selecionadas como último acesso. Datas antigas sem fuso mantêm o significado local original; conclusão não exclui um material da retomada.

## Administração e docência — PP02

O [complemento do PP02](docs/ESCOPO-PP02.md) registra as histórias HU004/HU007, a matriz de acesso e os diagramas desta etapa, incorporados ao DOCX acadêmico. A edição de 50 páginas foi renderizada e conferida; cópia anterior e relatório estão em `output/reviews/`. Essa evidência documental complementa os testes do frontend, sem substituí-los.

`User` mantém nome, e-mail e cargo global e acrescenta `active` opcional: a ausência preserva a interpretação de conta ativa dos dados anteriores. `RecordMeta` reúne revisão, autor/data da última alteração e marca de exclusão lógica, todos opcionais para compatibilidade. `Subject.teacherIds` substitui o campo singular; a migração transforma a atribuição antiga em uma lista, sem reiniciar o banco nem alterar sua chave/versão. A inativação, exclusão ou perda do cargo de professor retira as atribuições atuais, preservando os conteúdos e a autoria anteriores.

`access.ts` concentra consulta e ação: administração gerencia estrutura e equipe; docentes compartilham a gestão de conteúdos nas disciplinas atribuídas; alunos consultam os conteúdos de turmas ativas às quais estão vinculados e os próprios registros privados. A projeção entregue por `useApp()` limita coleções, destinos e detalhes por URL, retira registros excluídos das visões operacionais e preserva os nomes necessários à autoria. E-mails de terceiros só são expostos à equipe no contexto permitido. Docentes consultam envios concluídos; os rascunhos de resposta não são expostos pela projeção da equipe. Turmas inativas permanecem consultáveis pela equipe autorizada, com gestão de conteúdo bloqueada.

`demo-mutations.ts` opera sobre o banco interno completo e revalida o ator atual, o cargo, a atribuição, o contexto de destino e a disponibilidade antes de concluir uma receita. Impede alterações de estrutura por docentes, troca da autoria original, remoção física de registros e perda do último administrador ativo. Confere a revisão esperada e gera a nova revisão com autor/data. `AuditEvent` registra identificadores, coleção, ação e momento; mudanças de atribuição também geram eventos `teachingAssignments`, com alvo composto pelos IDs da disciplina e do docente. O log não copia nome, e-mail, respostas ou arquivos.

O estado do navegador coordena leitura da versão mais recente, validação e gravação com Web Locks. O evento `storage` sincroniza outras abas a partir do valor atualmente persistido, evitando reintroduzir um evento antigo. Carregamento/migração usa a mesma coordenação. Sem suporte a Web Locks, gravações persistidas são recusadas com orientação; se o armazenamento estiver indisponível, o aviso existente explica a persistência limitada à visita. Não há sincronização entre dispositivos.

Os editores conservam os campos locais e a revisão aberta. Uma alteração concorrente bloqueia o salvamento, mostra responsável/momento e permite consultar a versão atual antes de reconhecer a nova revisão. A conferência não salva automaticamente. A mutação também revalida acesso após a latência do mock, impedindo concluir uma operação com atribuição retirada ou conta inativa.

As correções de recuperação usam funções puras próximas do domínio: `subjects/lib/teaching-team.ts` conserva seleções indisponíveis visíveis e removíveis; `assessments/lib/assessment-editor.ts` recupera somente a estrutura vigente após a primeira entrega, sem reconhecer a revisão e sem perder os campos ainda editáveis. `compareAttendanceRecords`, em `lib/attendance.ts`, apresenta a união das marcações salvas/locais por aluno, distinguindo ausência de falta de registro. Essas transformações não alteram os formatos persistidos e possuem regressões unitárias, complementadas pelos roteiros de navegador.

Como proteção necessária à edição compartilhada de questionários, a primeira entrega bloqueia alterações estruturais; título, orientações e prazo continuam editáveis. Antes da primeira entrega, mudar as questões exige confirmação e reinicia respostas/ordem de todos os rascunhos da atividade, registrando `questionsUpdatedAt`. A sessão do aluno descarta a recuperação antiga e informa a atualização. O envio anterior nunca é reaberto nem sobrescrito. Essa aplicação da regra D11 não conclui as demais entregas do PP06.

A demo conserva o banco completo com dados fictícios no navegador de quem a utiliza. Projeções e comandos locais demonstram comportamento; não constituem autorização de servidor ou auditoria inviolável. Exclusão lógica não equivale à eliminação por privacidade nem autoriza retenção permanente. Matrícula pendente, entrega de arquivos/retorno docente, isolamento das questões autorais e avisos com calendário opcional permanecem nos respectivos pacotes posteriores. As evidências reais, sem presumir aceite apenas pela documentação, ficam no plano, em `VALIDACAO.md` e no relatório do pacote.

## Como alterar uma funcionalidade

### Materiais — PP04

`Material.videoUrl` é opcional para preservar registros antigos sem endereço. `lib/material-video.ts` aceita fontes HTTPS sem credenciais e constrói incorporações somente por IDs reconhecidos de YouTube/Vimeo. O formulário e `demo-mutations.ts` validam o endereço; materiais antigos sem URL permanecem consultáveis, com orientação para a equipe atualizar a fonte. O componente `MaterialVideo` só carrega o provedor por escolha do usuário, conserva o link externo e oferece saída explícita para bloqueios que não disparam erro de iframe. Não há player fictício ou hospedagem própria.

O leitor retorna à aba de materiais e à âncora do módulo de origem; PDF apresenta nome/tamanho e alternativa de download, preservando IndexedDB, publicação em lote, progresso individual e último acesso. Não há nova chave, reinicialização de banco ou migração de blobs. Histórias/diagramas do complemento estão em `docs/ESCOPO-PP04.md`; resultados e limites reais em `output/reviews/VALIDACAO-PP04.md`.

No PP03, `enrollments` registra pendência, efetivação e encerramento; `studentIds` permanece como projeção compatível do vínculo. Cadastro cria `emailConfirmedAt: null`; o comando de confirmação simula a etapa e resolve a pendência atomicamente. As mutações genéricas não confirmam e-mail nem editam essa coleção diretamente. Encerramento da turma deriva cancelamento das pendências e saída dos alunos, com auditoria. O instante da matrícula registra atividades já vencidas como não atribuídas, mesmo com aceitação de atraso; a chamada usa a data local do vínculo. Esses atributos não concluem o editor completo ou os tipos de entrega planejados no PP06.

Vínculos migrados sem data confiável são marcados como legados e exibem “data não registrada”. Múltiplas turmas ativas antigas permanecem preservadas para regularização explícita: nenhuma turma é escolhida automaticamente, e o contexto acadêmico do aluno fica bloqueado enquanto houver ambiguidade. O conflito não impede operações administrativas independentes. Nome/e-mail, respostas e demais registros permanecem na mesma chave e versão do banco.

A identidade de um vínculo efetivado é a conta referenciada: reutilizar o e-mail histórico de outra conta não pode confirmar uma matrícula inexistente ou transferir o vínculo. Para vínculos legados encerrados sem data de saída, a frequência conserva os dias já documentados, sem admitir novas chamadas futuras com base na data desconhecida. Essa elegibilidade é conferida contra o estado anterior à mutação, para que o novo registro não sirva como prova de si próprio.

1. Localize o domínio na tabela e leia a entrada pública e os componentes envolvidos.
2. Preserve regras compartilhadas existentes; mantenha regras específicas junto ao domínio quando uma nova extração for justificada.
3. Reutilize os elementos de UI e extraia componentes ou hooks por responsabilidade. Crie apenas arquivos necessários.
4. Verifique os consumidores de contratos públicos, as chaves de persistência e os caminhos de falha afetados.
5. Execute `npm test`, `npm run typecheck`, `npm run check:architecture` e `npm run build`. Valide as interações e os tamanhos de tela afetados conforme `VALIDACAO.md`.

Em refatorações sem alteração visual, compare capturas antes e depois com os mesmos dados, perfil, data e viewport. A organização busca facilitar compreensão e mudanças localizadas; ganhos de desempenho precisam ser medidos separadamente.
