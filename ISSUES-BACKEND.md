# Backlog de implementação do backend

**Estado:** backlog proposto; todas as issues abaixo permanecem abertas. Este documento define trabalho futuro para três serviços Kotlin/Spring Boot com arquitetura hexagonal. Não implementa backend, não altera a integração do frontend e não declara os endpoints existentes como implementados nesses serviços.

## Base e limites

- Revisão de partida: `516b820ef0324e3693cdf1c305f660153671aeec`.
- Contrato de compatibilidade pública: [`docs/http/openapi.json`](docs/http/openapi.json), OpenAPI 3.1, versão 1.0.8. A matriz de operações e ownership está em [`docs/backend/operation-ownership.md`](docs/backend/operation-ownership.md); regras observáveis e casos-limite estão em [`docs/http/route-matrix.md`](docs/http/route-matrix.md), [`docs/http/contract.md`](docs/http/contract.md), [`docs/http/operator.md`](docs/http/operator.md) e `ISSUES-FRONTEND-HTTP.md`.
- O OpenAPI fixa formas observáveis de requisição/resposta, códigos e cookie `aja_session`; não determina tecnologia interna, tabelas, eventos internos, topologia de implantação, nem que os exemplos de JSON Server sejam persistência obrigatória. Buscar compatibilidade de comportamento, sem transplantar detalhes acidentais do simulador.
- Os três serviços usarão a mesma instância PostgreSQL em schemas separados e com credenciais/roles próprias. Um serviço não lê, grava, migra ou consulta tabelas de outro. Não há schema compartilhado de identidade: Core é dono da identidade e expõe uma fronteira autenticada para serviços internos.
- Core acadêmico e Questões são serviços Kotlin/Spring Boot hexagonais. Email é worker assíncrono Kotlin/Spring Boot. Core grava outbox na mesma transação de negócio e publica por RabbitMQ; Email consome e mantém seu próprio estado no schema email. Nenhum pedido HTTP pode alegar entrega de email apenas porque o evento foi enfileirado.
- Não construir gateway nesta etapa. Não integrar, reconfigurar ou validar o frontend; não mudar `NEXT_PUBLIC_API_URL`, Next.js, páginas ou cliente browser. Os aceites são de API/serviço e comunicação backend-backend. A divisão de tráfego externo entre serviços fica em endpoints próprios até decisão/implantação futura de gateway.
- Todos os testes de serviço usam PostgreSQL e RabbitMQ reais de teste (por exemplo, Testcontainers) ou processos reais equivalentes. Não substituir resultados de sucesso por mocks de HTTP. Testes unitários cobrem domínio/adaptadores; testes de integração exercitam migrações, persistência, autorização e eventos.
- Datas e prazos são instantes/datas segundo os contratos e regras de Brasília. Usar relógio injetável. Validação, autorização e revisão acontecem no serviço no instante da escrita. Falha não pode produzir gravação parcial.

## Ordem e dependências

As dependências autoritativas são os cabeçalhos de cada issue. A sequência é B-01 antes de todas; B-02 antes de B-03/B-04/B-05; B-03 antes de B-04/B-11; B-04 antes de B-06/B-13; B-05 e B-06 antes de B-07; B-05/B-06/B-07 antes de B-08; B-08 antes de B-09; B-07/B-08 antes de B-10; B-06/B-08/B-03 antes de B-11; B-05/B-07 antes de B-12; B-04/B-06 antes de B-13; B-04 a B-13 antes de B-14; B-05/B-09 antes de B-15; B-02 a B-15 antes de B-16. B-05 entrega provider Questões e fixture própria; consumidores Core persistem snapshots em B-08. A resolução de prática só entra após tentativas em B-15.
## Issues

### B-01 — Criar os três serviços e as fronteiras de dados

**Depende de:** nenhuma. **Dono:** plataforma backend.

**Entradas:** este documento; `docs/http/openapi.json` (`GET /health`); dependências declaradas no projeto Kotlin a criar; instalação local descrita em `docs/http/operator.md` como referência operacional, não como requisito de JSON Server.

**Implementação:** criar projetos executáveis Kotlin/Spring Boot para Core, Questões e Email, com domínio/aplicação/portas/adaptadores separados. Adicionar migrações versionadas e usuários PostgreSQL separados para schemas `core`, `questions` e `email`; cada role tem acesso apenas ao próprio schema. Configuração externa por ambiente, sem segredos no repositório. Definir health/readiness e logging sem credenciais ou conteúdo pessoal. Empacotar execução local reproduzível com PostgreSQL e RabbitMQ. Os processos de teste/desenvolvimento são chamados diretamente.

**Aceite verificável:** iniciar os três processos e dependências numa instalação limpa; cada serviço informa health e versão sem declarar saudável quando seu banco ou dependência obrigatória está indisponível. Verificar por conexão e migrações que cada role não consegue ler ou alterar os outros schemas. Reiniciar processos sem perder dados; verificar que nenhum serviço cria/usa tabelas no schema alheio.

**Testes:** teste de arquitetura hexagonal/import boundaries; migração vazia e migração repetida; teste de privilégios por role; health/readiness com dependência ligada/desligada; configuração sem valores secretos embutidos.

### B-02 — Implementar identidade, autenticação, autorização base e sessão no Core

**Depende de:** B-01. **Dono:** Core.

**Entradas:** os dez endpoints Core `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/email-confirmation-requests`, `/auth/email-confirmations`, `/auth/password-reset-requests`, `/auth/password-resets`; `GET /auth/session`, `GET /me`, `PATCH /me`; schemas OpenAPI `Register`, `Login`, `EmailRequest`, `TokenCommand`, `PasswordReset`, `Session`, `SelfUser`, `ProfileEdit`; regras em `docs/http/route-matrix.md`, `docs/http/contract.md` e `docs/http/operator.md`. `GET /me/enrollments` pertence à B-04.

**Implementação:** Core é a fonte de verdade para contas, e-mail confirmado, papel, status e sessões. Armazenar senha com hash apropriado; usar cookie HttpOnly `aja_session`, SameSite/Secure e controle Origin contratado; não inventar header CSRF. Papel/ator vêm da sessão validada, nunca do corpo. `PATCH /me` altera só nome com `expectedRevision`. Implementar tokens de confirmação e reset no Core com hash, expiração, uso único, vinculação ao endereço atual e resposta neutra; nova solicitação invalida tokens anteriores apenas da mesma finalidade. Reset bem-sucedido revoga todas as sessões e tokens anteriores de recuperação, preservando tokens de confirmação de e-mail. Criar evento/token de confirmação no cadastro dentro da mesma transação e outbox; B-03 apenas publica/entrega. Expor introspecção interna autenticada para Questões validar sessão ativa, sem SQL cross-schema nem cache; não incluir decisão de tentativa até B-15. Registrar auditoria sem segredos.

**Aceite verificável:** exercitar os dez endpoints diretamente no Core real. Cobrir cadastro/login, cookies, perfil/revisão, logout/inativação, requests neutros existentes/inexistentes, token expirado/usado/anterior ou ligado a outro endereço; reset invalida todas as sessões. Confirmar token muda o estado no Core; evento aparece atomicamente na outbox; B-03 não é necessário para estes testes. Origin não permitido é recusado usando somente cabeçalhos contratados. `role`/`userId` falsos e segredos/token/hash nunca aparecem nos DTOs. Introspecção retorna apenas principal/estado mínimos e jamais registra cookie.

**Testes:** RED/GREEN HTTP/DB dos dez endpoints; requests neutros; fixture de token/clock; uso único, troca de endereço, expiração e reset/revogação; outbox no rollback/commit; Origin e cookie; contrato de introspecção serviço-a-serviço com boundary SQL/logs.

### B-03 — Implementar worker de email e outbox transacional

**Depende de:** B-01 e contrato/eventos de B-02. **Dono:** Core para outbox/publicação; Email para consumo/envio.

**Entradas:** eventos já produzidos por Core B-02 (cadastro, confirmação de e-mail e reset de senha); schemas/mensagens internas versionadas. Eventos de provisionamento de equipe e avisos serão adicionados pelos consumidores B-04/B-11, fora do aceite base desta issue. Endpoints públicos HTTP e tokens são responsabilidade de B-02.

**Implementação:** B-02 cria token de uso único e outbox transacional no Core. B-03 implementa publisher Core→RabbitMQ com confirmação e recuperação após crash (at-least-once) e worker Email consumidor; não implementa endpoints públicos, tokens ou regra de negócio de confirmação/reset. Token bruto só vai no payload protegido do evento, nunca em logs/outbox consultável ou respostas. Worker deduplica event ID, registra tentativas/estado apenas no schema email e envia por adaptador configurável. Retry limitado, backoff, poison message/DLQ observável e redrive operacional seguro. Segredos do provedor via ambiente/secret store. Para SMTP/provedor sem chave idempotente, documentar a janela ambígua de crash depois da entrega externa e antes de persistir resultado; registrar estado desconhecido para reconciliação. Não prometer exatamente uma entrega externa.

**Aceite verificável:** consumir eventos reais de confirmação de e-mail e reset de senha produzidos por B-02; falha publisher/outbox recupera sem perda, redelivery não duplica estado interno, worker envia pelo adaptador capturado e estado de envio lida com ambiguidade sem marcar sucesso falso. Teste integrado confirma/resetta conta pelo endpoint Core após o token consumido. Matrícula efetivada junto da confirmação é aceita em B-04, que depende deste worker e cobre sua transação. Não reimplementar token, endpoint, autorização ou enumeração de conta.

**Testes:** outbox/publisher real, retry/ack/DLQ, duplicata, crash/restart e adaptador email capturado; fluxo integrado usando HTTP e tokens geridos pelo Core, sem teste de regra/token duplicado em Email.

### B-04 — Implementar classes, usuários administrativos, alunos e matrículas no Core

**Depende de:** B-02 e B-03. **Dono:** Core.

**Entradas:** operações `/users`, `/classes`, `/students`, `/enrollments` da matriz ownership; schemas OpenAPI `AdminUser`, `Class*`, `Student*`, `Enrollment*`, `RevisionCommand`; regras de inativação, último administrador, encerramento e matrícula em `docs/http/route-matrix.md`.

**Implementação:** listagem/paginação/filtragem e comandos públicos do contrato, incluindo `GET /me/enrollments`. G administra usuários, papel, classes e vínculos; docente só vê contextos atribuídos; aluno ativo confirmado vê somente seus vínculos. Matrícula por email normalizado pode ficar pendente até confirmação de identidade, sem promover/criar conta. Uma turma ativa por aluno; incluir ativação/cancelamento/saída como transições de estado, não CRUD arbitrário. Encerramento de turma, cancelamentos e saídas são transacionais e preservam histórico/autoria.

**Aceite verificável:** API real cobre criação/edição, consultas filtradas, preview de email, criação/ativação/cancelamento/saída, conflitos, duplicatas e chamadas após revogação. `POST /auth/email-confirmations` confirma a conta e efetiva matrícula pendente elegível na mesma transação; falha/corrida não confirma apenas um lado. `POST /enrollments/{id}/activate` é comando administrativo só de vínculo para conta já confirmada e não altera estado da conta. Provisionamento de docente cria token para definição de senha e token/email de confirmação, e os dois eventos são gravados na mesma transação. Garantir atomicamente último administrador, unicidade de matrícula/turma e histórico após fechamento. Repetição não duplica vínculos; docente sem atribuição/aluno sem vínculo recebem negação/ocultação prevista.

**Testes:** unitários de políticas/transições; integração de restrições e atomicidade; concorrência em cadastro de vínculos e último administrador; matriz de perfis e revisão obsoleta; preservação de registros após encerramento.

### B-05 — Implementar acervo e provider de snapshots do serviço Questões

**Depende de:** B-01 e B-02. **Dono:** Questões para acervo e provider; Core para persistência/uso dos snapshots em B-08. A resolução pública `POST /questions/{id}/practice` fica em B-15, após B-09.

**Entradas:** `GET /questions`, `GET /questions/{id}` e futura porta interna versionada de snapshot; schemas de leitura `QuestionPractice*`, `QuestionResolved`, `AssessmentQuestionSnapshot`, `AuthoredQuestion`; regras em `docs/http/route-matrix.md`, `docs/http/contract.md` e AJA-09.

**Implementação:** Questões é dona do acervo, conteúdo e vínculo `questionId → fileId`; Core é dono dos bytes/endpoints públicos `/files`, inclusive imagens. Implementar filtros combináveis, paginação e detalhe; validar sessão ativa por introspecção mínima autenticada com Core, sem consulta de tentativas. A API interna autenticada do serviço retorna snapshots em lote dos IDs pedidos, com revisão/versão e referência imutável de imagem. Prover fixture de catálogo versionada para os testes, incluindo casos de questão retirada e imagem. Questões autorais restritas pertencem ao Core. Não implementar consumidor que persiste avaliações, captura bytes no storage Core ou resolução prática nesta issue; esses aceites pertencem a B-08, B-07 e B-15.

**Aceite verificável:** chamadas HTTP reais de GET validam sessão ativa, escopo, filtros, paginação e retirada usando apenas introspecção de sessão, sem decisão de tentativa. Endpoint privado Core→Questões devolve snapshot pedido e versão de modo autenticado, sem SQL cross-schema. Os testes da API Questões não dependem de B-08/B-09 e não afirmam persistência Core. Leitura pública não expõe gabarito. Conteúdo e referência de versão/hash do provider são estáveis para Core capturar; captura de bytes/persistência histórica é verificada nas issues consumidoras.

**Testes:** contrato HTTP GET; integração real de introspecção Core; filtros/paginação/autorização/retirada; fronteira role SQL; contrato privado de snapshot em lote, versão e imagem; fixture versionada e lote inválido. Prática e suas regras são verificadas somente em B-15.

### B-06 — Implementar disciplinas, atribuições, módulos, ordem e visitas no Core

**Depende de:** B-04. **Dono:** Core.

**Entradas:** `/subjects`, `/modules`, `/subjects/{id}/visits`, reordenação; schemas `Subject*`, `Module*`, `OrderCommand`, `Visit*`; regras AJA-07 em `docs/http/contract.md`.

**Implementação:** criar/editar disciplinas e equipe, leitura por turma/papel, detalhe com projeções permitidas, módulos e ordenação completa. A reordenação de materiais da disciplina pertence à B-07. Visitas são por conta e juntam somente IDs de publicações que o cliente observou. Revalidar atribuição, matrículas e atividade da conta em cada escrita. Conflitos devem preservar registros e ordem.

**Aceite verificável:** dois docentes atribuídos podem colaborar; desatribuição impede gravação seguinte; aluno só consulta suas disciplinas. Conflito entre criação concorrente/ordenação detecta revisão e mantém todos os módulos. Visita não marca como vista publicação que apareceu depois da leitura; visitante de outra conta não compartilha estado.

**Testes:** integração de autorização e revisão concorrente; transação atômica de ordenação; isolamento das visitas e merges concorrentes; DTOs/projeções sem conteúdo de domínios downstream.

### B-07 — Implementar arquivos, materiais e progresso no Core

**Depende de:** B-05 e B-06. **Dono:** Core.

**Entradas:** `/files`, `/materials`, `/me/progress`; schemas `File*`, `Material*`, `Progress*`; regras de preparação, lote, download e falha em `docs/http/route-matrix.md` e `docs/http/contract.md`; imagens de questões e snapshots especificados em B-05.

**Implementação:** armazenamento binário por adaptador substituível; Core mantém metadados, estado e bytes para todo `purpose`, inclusive imagens de questão. `POST /files` aceita só usos públicos do OpenAPI (material/work/forum); imagens são provisionadas no fluxo interno/import do acervo, sem inventar upload público. Upload preparado, validação de MIME/tamanho/nome/uso/autor, descarte e publicação em lote transacional. Anexos de trabalho respeitam escopo de entrega. Imagem corrente do acervo é acessível a sessão ativa; imagem histórica de snapshot só se serve sob autorização do pai/avaliação, sem precisar de Questões quando Core já tem bytes. Material suporta texto, PDF e vídeo externo; progresso individual é gravado no Core com repetição segura. Não persistir binários na resposta JSON nem tomar JSON Server como contrato de storage.

**Aceite verificável:** upload real em storage de teste, inspeção do conteúdo/hash, download autenticado com MIME/disposição; negar ID alheio, pai inacessível e recurso oculto. Autor consegue retomar e descartar sua preparação própria; preparação de outra conta não pode ser reutilizada. A preparação de trabalho é legível apenas pelo aluno autor enquanto estiver vigente e autorizado. A equipe só lê anexos de entregas enviadas quando autorizada. Imagem de questão corrente é acessível a sessão ativa; política de imagem exclusiva de avaliação em rascunho nega leitura ao aluno. Snapshot histórico e autorização real sob tentativa/entrega/fórum são integrados em B-08/B-10/B-12 e B-16. Nenhuma tupla vira parâmetro público de `/files/{id}/content`. Lote inválido não cria publicação parcial; preparação abandonada é recuperável/limpável; falha preserva composição; conclusão repetida não duplica progresso.

**Testes:** upload/leitura da preparação própria; limites/assinatura MIME; integridade de bytes/hash; atomicidade de lote e órfãos; políticas do pai exercitadas com fixtures reais persistidas; rollback e repetição de progresso. Integração real de snapshot em avaliação, entrega e fórum fica em B-08/B-10/B-12 e B-16.

### B-08 — Implementar autoria, snapshots e publicação de atividades no Core

**Depende de:** B-05, B-06 e B-07. **Dono:** Core.

**Entradas:** `/assessments`, schemas `Assessment*`, `AssessmentQuestionEntry`, `AssessmentQuestionSnapshot`, `AuthoredQuestion`; regras de snapshot, revisão, reset de rascunhos e publicação em `docs/http/route-matrix.md`/`docs/http/contract.md`.

**Implementação:** criar/listar/ler/editar/publicar quiz e trabalho, papéis staff/aluno e visibilidade por vínculo/estado. Ao compor questão de acervo, buscar snapshot apenas para referências novas via provider Questões e persistir cópia resolvida no Core. Se já há snapshot, edição/publicação reutiliza a cópia mesmo após retirada/alteração da origem; nunca reconsulta ou regrava snapshots antigos. Guardar questão autoral restrita somente no Core. Validar duplicatas, gabarito, prazo, módulo e limites. Depois de primeiro envio bloquear alterações estruturais; antes disso só reiniciar rascunhos após confirmação explícita. Não escrever no schema Questões.

**Aceite verificável:** API Core com Questões e storage real: salvar/publicar; alteração/retirada da questão deixa snapshot histórico e bytes capturados imutáveis; edição só de metadados preserva snapshots antigos com Questões indisponível; apenas IDs novos pedem snapshot. Falha para ID novo não publica parcialmente nem perde rascunho. Questão autoral não aparece no acervo. Revogação/revisão concorrente impede commit. Aluno não recebe gabarito; staff não atribuído não administra atividade.

**Testes:** testes unitários de portas/guardas estruturais com doubles; integração real de captura/publicação com Questões/storage. Bloqueio após primeiro envio confirmado é coberto e evidenciado nas issues consumidoras B-09/B-10.

### B-09 — Implementar tentativas, retomada, envio e resultado de quiz no Core

**Depende de:** B-08. **Dono:** Core.

**Entradas:** `/attempts`, schemas `Attempt*`, `AnswersCommand`, `AttemptResult`, `Receipt`; regras de prazo, atribuição, repetição e sigilo em `docs/http/route-matrix.md` e contrato AJA-11.

**Implementação:** iniciar/retomar por aluno, capturar ordem e snapshots no momento contratado, salvar respostas com revisão, enviar com `Idempotency-Key` obrigatório (8–128 caracteres), efeito repetido por pelo menos 24 horas e recibo permanente. Decisão de prazo no servidor usando fuso de Brasília; respostas em branco válidas. Gabarito e nota permanecem ocultos enquanto não autorizados.

**Aceite verificável:** dois clientes HTTP com a mesma sessão retomam respostas persistidas. Envio simultâneo/repetido e perda simulada da resposta dão um recibo/resultado só. Após submissão não se edita; outro aluno não lê resultado. Exercitar prazos com relógio controlado e mudança de avaliação/acervo após início sem alterar snapshot.

**Testes:** concorrência e idempotência com PostgreSQL; replay igual/divergente; recibo após restart e depois de 24h; relógio e prazo; revisão obsoleta; autorização cross-user; sigilo de gabarito/resultados.

### B-10 — Implementar entregas e devolutivas de trabalho no Core

**Depende de:** B-07 e B-08. **Dono:** Core.

**Entradas:** `/submissions`, schemas `Submission*`, `Feedback*`, `Receipt`, `FileAttachment`, `LinkAttachment`; regras AJA-12 em matriz/contrato.

**Implementação:** preparação e envio de anexo/link próprio; validação de prazo, atribuição, limites e arquivo no commit; `Idempotency-Key` obrigatório (8–128 caracteres), replay por ao menos 24h e recibo permanente; feedback separado em rascunho, publicação e histórico; nota opcional dentro da escala da atividade. Aluno vê apenas a própria entrega e feedback publicado. Docentes concorrem por revisão; revogação impede publicação.

**Aceite verificável:** upload interrompido/inválido não gera entrega vazia e permite retomar; ID alheio não é aceito; recarga recupera recibo; dois docentes não sobrescrevem feedback; aluno não lê rascunho, feedback de outro nem entrega de peer. Testar acesso por ID direto.

**Testes:** integração com B-07 storage e B-08 avaliação; repetição/concorrência; visibilidade do feedback; rollback; falhas de upload e autorização.

### B-11 — Implementar avisos e calendário no Core

**Depende de:** B-03, B-06 e B-08. **Dono:** Core para aviso/outbox; Email para template/entrega.

**Entradas:** `/announcements`, `/calendar`; schemas `Announcement*`, `Occurrence`, `CalendarItem`; regras AJA-13 e caixa local de notificações em `docs/http/contract.md`.

**Implementação:** aviso em escopo de turma/disciplinas, editar/retirar por staff autorizado, ocorrência de dia inteiro ou horário; calendário e prazos derivam de conteúdo visível nos serviços Core. `notify=true` grava evento outbox transacional com destinatários que são estudantes ativos autorizados na turma/disciplina; um envio por destinatário/aviso/versão. `notify=false` não publica evento. Email usa template próprio e estado unknown quando provedor não assegura idempotência. Não afirmar entrega sem confirmação nem criar inbox browser. Não duplicar evento legado.

**Aceite verificável:** criar/editar/retirar aviso altera calendário; turma/papel isolados; prazos de atividades visíveis corretamente; datas inválidas rejeitadas; não duplica evento/email além da garantia real do provedor; estado ambíguo fica observável. Nenhum endpoint declara email entregue sem confirmação.

**Testes:** integração de projeção e datas; timezone; isolamento; edição/retirada; evento/template Email; falha de outbox sem perda do aviso; estado externo desconhecido.

### B-12 — Implementar fórum, referências e estado por usuário no Core

**Depende de:** B-05 e B-07. **Dono:** Core.

**Entradas:** `/topics`, `/topics/{id}`, replies/read/solution/vote/withdraw; schemas `Topic*`, `Reply*`, `Target`, `VoteCommand`, `SolutionCommand`; regras AJA-14 em matriz e contrato.

**Implementação:** persistir tópicos, respostas concorrentes, referência por ID a questão/material, anexos preparados, leitura e voto próprios, solução e retirada auditável. Referência é validada em fronteira autenticada Core↔Questões ou serviço de materiais Core; forum não lê schema Questões. Busca inclui texto das respostas e filtros/ordenação do contrato. Acesso da equipe em turma encerrada é leitura conforme contrato; novas publicações vedadas.

**Aceite verificável:** duas respostas concorrentes permanecem; leitura/voto repetidos têm estado idempotente; nova resposta renova não lida para os demais; retirada da resposta escolhida remove solução e preserva auditoria. Usuário revogado perde tópico e download. Referência inválida/retirada não produz link público ou leak de dados.

**Testes:** integração de concorrência, estado por conta, transação solução/retirada e anexos; permissão depois de revogação; chamadas internas Questões sem acesso ao schema; busca no conteúdo.

### B-13 — Implementar chamada e histórico de frequência no Core

**Depende de:** B-04 e B-06. **Dono:** Core.

**Entradas:** `/attendance`, `/attendance/eligible`, schemas `Attendance*`, `EligibleStudent*`; regras AJA-15, datas anteriores/posteriores a vínculo e legado em `docs/http/route-matrix.md`.

**Implementação:** lista de elegíveis, consulta histórica e gravação por disciplina/data/horário. Identidade única de aula; `POST /attendance` usa `Idempotency-Key`, `PATCH /attendance/{id}` usa `expectedRevision`. Docente atribuído ou admin autorizado pode gravar; detalhe individual de aluno respeita escopo histórico e ocultação indicada na matriz.

**Aceite verificável:** sessões simultâneas não criam duas aulas; conflito conserva edição para comparação e não substitui marcações; desatribuição/turma encerrada nega gravação. Elegibilidade histórica considera matrícula/saída e registros antigos sem data conforme regra contratual.

**Testes:** integração de identidade única e concorrência; seleção por data/hora; perfil autorizado versus peer-only/retirado; regras de legado e vínculos.

### B-14 — Implementar painel e projeções privadas no Core

**Depende de:** B-04 a B-13. **Dono:** Core.

**Entradas:** `GET /me/dashboard`, schemas `DashboardRead`, `DashboardStudent`, `DashboardStaff` e tipos relacionados; regra de não baixar base integral e jornadas AJA-16 em matriz/contrato.

**Implementação:** agregação no lado servidor a partir de módulos/portas do Core; projetar somente campos permitidos pelo papel, conta e contexto atual. Reutilizar consultas/políticas dos domínios, horário corrente; não materializar nem devolver snapshot global privado. Links cruzados referem recursos reautorizados quando abertos.

**Aceite verificável:** consultas reais para aluno sem turma, aluno vinculado, docente sem disciplina, docente atribuído e admin; cada resposta contém apenas projeções autorizadas e contagens consistentes com endpoints fonte. Revogação entre chamadas impede nova leitura. Instrumentar limites para evitar N+1 e consultas sem escopo/paginação.

**Testes:** contratos por papel, cruzamento com respostas de recursos origem, isolamento de revogação, estados vazios, paginação/limites e orçamento de consultas.

### B-15 — Implementar prática segura bloqueada por tentativa avaliativa

**Depende de:** B-05 e B-09. **Dono:** Questões para resolver/publicar; Core para introspecção e decisão da tentativa.

**Entradas:** `POST /questions/{id}/practice`, schemas `PracticeCommand` e `PracticeResult`; contrato de tentativa `GET/POST /attempts`, snapshot de B-09, `docs/http/contract.md`, `docs/http/route-matrix.md`; testes de referência `tests/http-questions.test.mjs` e `tests/http-attempts.test.mjs`.

**Implementação:** completar a operação prática que ficou fechada em B-05. Validar sessão, questão visível e escolha, nessa ordem; antes de devolver correção, fazer chamada privada autenticada Questões→Core sem cache. Core consulta seu estado consistente para saber se o principal tem tentativa viva/não enviada de quiz publicado e atribuído contendo a questão no snapshot/ordem. Não bloquear GET de lista/detalhe. Questões não persiste nota/tentativa nem acessa schema Core.

**Aceite verificável:** com tentativa pendente, GET lista/detalhe continuam 200 e usam apenas introspecção de sessão. Em POST practice, sessão inválida/inativa retorna 401; questão removida/oculta retorna 404; alternativa inválida 422; somente depois tentativa bloqueadora retorna 409 sem correção. Corrida com barreira: início de tentativa confirmado antes da decisão Core impede exposição; logout/inativação confirmados resultam em 401; perda de matrícula/atribuição remove condição bloqueadora, mas a sessão ativa pode praticar questão ativa (200), sem revelar snapshot/resultado acadêmico. Se decisão válida precede mudança, requisição pode ser ordenada antes. Indisponibilidade de introspecção retorna 503 sem sucesso/correção. Prática repetida permitida usa correção atual sem criar estado. Questões não conhece matrículas/provas; recebe somente decisão mínima de Core.

**Testes:** integração HTTP real Core↔Questões; precedência 401/404/422/409/503; bloqueio por questão no snapshot e tentativa publicada/viva; retirada; concorrência determinística início, logout, inativação, saída de turma e desatribuição; provar ausência de linha/nota/snapshot acadêmico em prática.

### B-16 — Verificar contrato agregado e operação direta dos serviços

**Depende de:** B-02 a B-15. **Dono:** integração backend.

**Entradas:** todas as operações de [`docs/backend/operation-ownership.md`](docs/backend/operation-ownership.md); `docs/http/openapi.json`; cenários/comandos em `docs/http/operator.md`; comportamento das suítes de referência `tests/http-auth.test.mjs`, `tests/http-administration.test.mjs`, `tests/http-subjects.test.mjs`, `tests/http-materials.test.mjs`, `tests/http-questions.test.mjs`, `tests/http-assessments.test.mjs`, `tests/http-attempts.test.mjs`, `tests/http-submissions.test.mjs`, `tests/http-announcements.test.mjs`, `tests/http-forum.test.mjs`, `tests/http-attendance.test.mjs`, `tests/http-dashboard.test.mjs`, `tests/http-consistency.test.mjs` e `tests/http-real-process-contract.test.mjs`. Esses testes descrevem requisitos observáveis atuais; não são evidência de que backend Kotlin já passou.

**Implementação:** criar verificação automática do OpenAPI e contratos HTTP de integração para os 98 pares path+method, cobrindo entradas/schemas, autenticação, papéis, códigos de falha e headers sem inventar DTO duplicado. Exercitar diretamente os processos Core e Questões, RabbitMQ Email e dependências PostgreSQL; inclui chamadas internas assinadas/privadas, fluxos por mais de um serviço, reinício, perda/retentativa e indisponibilidade. Testar cada família e edge case da matriz operacional, inclusive dados apagados/ocultos, revisão, Idempotency-Key, snapshots/arquivos e outbox. Não usar frontend, gateway ou browser. O relatório pode listar request individual por operationId e código, sem afirmar chamada de UI.

**Aceite verificável:** operação count automático coincide com os 98 path+method do OpenAPI, cada um tem request/resposta real e ao menos um caso positivo e as negações pertinentes; cobertura por papel e chamadas internas está rastreável a teste. Reiniciar os serviços mantém sessão/revisões/recibos/snapshots/outbox conforme cada domínio. Falhas reais de conexão/DB/RabbitMQ/storage não retornam sucesso fabricado nem gravação parcial. Relatório final registra comandos, resultados, falhas/cobertura não testada, schema e limitações.

**Testes:** gate de geração/validação OpenAPI; suítes de integração por domínio; contrato entre processos; testes controlados de restart e falha; teste de limites de schemas SQL. E2E de navegador é explicitamente fora do aceite atual.

## Protocolo comum de execução das issues

- Cada mudança comportamental começa com teste focado RED, registra comando/nome/falha esperada, passa a GREEN com a mesma verificação e refatora mantendo o teste verde. Manter regressão no diff.
- Em cada issue, registrar revisão inicial, critérios, entradas/rotas afetadas e evidências. Usar suites existentes citadas por nome como contratos de comportamento; elas rodam no frontend JSON Server e não contam como aceite do backend.
- Após estável, executar testes focados e suites reais Kotlin do repositório backend, comandos de arquitetura/build, migrações e contrato HTTP conforme definidos em B-01. Não usar `npm test`/build do frontend como prova da implementação Kotlin. Registrar comandos exatos e resultados.
- Aceites de backend usam chamadas reais aos serviços e broker/storage/dependências reais de teste. Sem browser/E2E. Revisão independente ECC e Ponytail, rechecagens de correções, gates finais e commit local por issue são requeridos pelo fluxo de trabalho do repositório. Não fechar issue se gate/revisão obrigatório falhar.

## Decisões fixadas para implementação

1. Questões→Core introspecção é síncrona, privada, autenticada serviço-a-serviço, sem cache e responde só principal vigente/decisão necessária; Core é a única fonte para identidade, autorização acadêmica e bloqueio de prática.
2. Core mantém bytes/metadados públicos de `/files`, inclusive imagens de questão; Questões mantém vínculo questão→fileId. Snapshots Core retêm versão/hash/bytes e autorizam leitura histórica por recurso pai. Sem cross-schema SQL.
3. Busca de snapshot é versionada e fora da transação Core; no commit revalidar ator, vínculo/revisão e idempotência. Resultados e snapshots já persistidos não dependem de Questões estar online.
4. `Idempotency-Key` já consta do contrato: obrigatório nas 24 operações especificadas, 8–128 caracteres e replay do resultado por ao menos 24h. Recibos permanentes valem para os envios únicos de quiz e trabalho, não para todo comando idempotente.
5. `docs/http/contract.md` e evidências podem descrever JSON Server, arquivos no disco ou histórias de migração. São evidência de comportamento quando observável, não requisitos para repetir storage ou detalhes temporários do simulador.
6. Não criar Gateway/BFF/proxy público, UI administrativa, migração ou conexão com frontend, CRUD público para questões ou inbox browser.

## FUTURO — fora do trabalho executável agora

- Gateway e roteamento público único de `/api/v1` para Core e Questões.
- Autenticação centralizada, rate limiting ou autorização no gateway; agora cada serviço protege sua superfície e contratos internos são autenticados serviço-a-serviço.
- Integração e reconfiguração do frontend, proxy/BFF temporário ou alterações em páginas/cliente browser.
- Testes E2E browser/Playwright, viewport/teclado e migração da UI. Aceites atuais chamam serviços reais diretamente e não esperam pelo gateway.
