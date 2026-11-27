# Ownership das operações backend

> **Registro histórico de planejamento da decomposição backend (pré-INT-05).** Observações sobre serviços ainda inexistentes e integração de gateway “fora da etapa atual” refletem o momento em que esta matriz foi elaborada. Para a execução vigente do frontend integrado por padrão ao gateway em `http://127.0.0.1:3002/api/v1` (e mock JSON Server opt-in em `3102`), consulte [README.md](../../README.md), [operator.md](../http/operator.md) e [validation-INT-05.md](../http/validation-INT-05.md).

Esta matriz atribui cada operação pública do OpenAPI 1.0.8 ao serviço que a implementará. São contratos-alvo do frontend atual, não prova de que os três serviços já existam. Caminhos são relativos a `/api/v1`. O gateway e a integração com frontend estão fora da etapa atual.

## Superfície pública

| Área/issue | Dono | Operações públicas | Limites de ownership |
| --- | --- | --- | --- |
| Saúde / B-01 | Core | `GET /health` | Health local dos outros processos é endpoint de operação, fora do OpenAPI público. |
| Identidade, sessão, perfil / B-02 | Core | `POST /auth/register`; `POST /auth/login`; `POST /auth/logout`; `GET /auth/session`; `GET /me`; `PATCH /me` | Core é única fonte de identidade/papéis/sessões. Email não hospeda endpoint browser. |
| Confirmação e recuperação / B-02 | Core | `POST /auth/email-confirmation-requests`; `POST /auth/email-confirmations`; `POST /auth/password-reset-requests`; `POST /auth/password-resets` | Core cria/valida tokens e aplica estado; grava eventos em outbox. Email só consome e entrega; não expõe endpoint público. |
| Gestão de pessoas, turmas, alunos, matrículas / B-04 | Core | `GET, POST /users`; `GET, PATCH /users/{id}`; `POST /users/{id}/role`; `POST /users/{id}/deactivate`; `POST /users/{id}/withdraw`; `GET, POST /classes`; `GET, PATCH /classes/{id}`; `POST /classes/{id}/close`; `POST /classes/{id}/reopen`; `GET /students`; `GET /students/{id}`; `GET /enrollments`; `POST /enrollments`; `GET /enrollments/preview`; `GET /enrollments/{id}`; `POST /enrollments/{id}/activate`; `POST /enrollments/{id}/cancel`; `POST /enrollments/{id}/end`; `GET /me/enrollments` | Matrícula, atribuição e autorização ficam no Core. Confirmação de token efetiva conta e matrícula pendente elegível atomicamente; ativação administrativa altera somente vínculo já confirmado. |
| Disciplinas, módulos e visitas / B-06 | Core | `GET, POST /subjects`; `GET, PATCH /subjects/{id}`; `GET, POST /subjects/{id}/visits`; `GET /modules`; `POST /modules`; `GET, PATCH /modules/{id}`; `POST /subjects/{id}/reorder-modules` | Projeções resumidas integram domínios Core sem transferir posse dos dados. |
| Arquivos, materiais e progresso / B-07 | Core | `POST /modules/{id}/reorder-materials`; `GET /files/{id}`; `GET /files/{id}/content`; `POST /files`; `POST /files/{id}/discard`; `GET /materials`; `GET /materials/{id}`; `POST /materials/batch`; `PATCH /materials/{id}`; `GET /me/progress`; `PATCH /me/progress` | Core é dono de todos os metadados e bytes de `/files`, inclusive imagens de questões (`purpose=question`). Questões é dono do vínculo do ativo com questão. Imagem de snapshot é imutável no Core para permitir resultado histórico mesmo que a questão seja retirada ou substituída. `POST /files` só aceita os usos públicos definidos no OpenAPI (material, work, forum); imagens de questão são provisionadas/importadas por fluxo de backoffice de Questões, não por upload público não contratado. |
| Acervo e snapshots / B-05 | Questões | `GET /questions`; `GET /questions/{id}` | Questões é dono do catálogo e filtros; não tem CRUD público e não lê schema acadêmico. |
| Prática segura / B-15 | Questões com decisão de Core | `POST /questions/{id}/practice` | Somente esta operação consulta tentativa bloqueadora; GETs de questão continuam disponíveis conforme autorização normal. Prática não persiste nota/tentativa. |
| Atividades e autoria / B-08 | Core | `GET /assessments`; `POST /assessments`; `GET /assessments/{id}`; `PATCH /assessments/{id}`; `POST /assessments/{id}/publish` | Questões de acervo vêm de API interna de snapshot. Questões autorais restritas e cópias resolvidas pertencem ao Core. |
| Quiz, tentativas e resultados / B-09 | Core | `GET /attempts`; `POST /attempts`; `GET /attempts/{id}`; `PATCH /attempts/{id}/answers`; `POST /attempts/{id}/submit`; `GET /attempts/{id}/result` | Core decide acesso e prazo, guarda resposta e recibo e calcula resultado sobre o snapshot. |
| Trabalho e devolutiva / B-10 | Core | `GET /submissions`; `POST /submissions`; `GET /submissions/{id}`; `PATCH /submissions/{id}`; `POST /submissions/{id}/submit`; `PATCH /submissions/{id}/feedback`; `POST /submissions/{id}/publish-feedback` | Core é dono das entregas e feedback; arquivos servidos pela mesma política de `/files`. |
| Avisos e calendário / B-11 | Core | `GET, POST /announcements`; `GET, PATCH /announcements/{id}`; `POST /announcements/{id}/withdraw`; `GET /calendar` | Calendário deriva de aviso/prazo visível. `notify=true` gera evento apenas para estudantes ativos autorizados na turma/disciplina; `notify=false` não cria evento. Entrega externa é de Email. |
| Fórum / B-12 | Core | `GET, POST /topics`; `GET /topics/{id}`; `POST /topics/{id}/replies`; `POST /topics/{id}/read`; `POST /topics/{id}/solution`; `POST /topics/{id}/withdraw`; `POST /topics/{id}/replies/{replyId}/vote`; `POST /topics/{id}/replies/{replyId}/withdraw` | Referência a questão consulta contrato interno Questões; referência a material e anexos fica no Core. |
| Frequência / B-13 | Core | `GET /attendance`; `POST /attendance`; `GET /attendance/eligible`; `GET /attendance/{id}`; `PATCH /attendance/{id}` | Histórico, elegibilidade, autorização e revisão ficam no Core. |
| Painel / B-14 | Core | `GET /me/dashboard` | Projeção filtrada pela política vigente; sem transferência de base integral ao cliente. |

Cada método agrupado acima representa um path+method do OpenAPI. A lista deriva de `docs/http/openapi.json`; os schemas e parâmetros exatos permanecem definidos no próprio OpenAPI para evitar uma segunda cópia sujeita a divergência.

## Interfaces privadas entre serviços (novas, não públicas)

Estas interfaces são necessárias aos aceites backend-backend, mas **não** são operações existentes no OpenAPI e não devem ser montadas em `/api/v1` público:

| Emissor → destino | Uso | Regras mínimas |
| --- | --- | --- |
| Questões → Core | Introspecção síncrona de `aja_session` para leitura/prática | Canal privado e identidade de serviço autenticada; sem cache; não registrar cookie. Core retorna principal/estado mínimos. Para prática, responder também se há tentativa avaliativa pendente e viva contendo a questão sob snapshot, atividade publicada, aluno atual e atribuição vigente. Questões não precisa e não recebe tabelas acadêmicas. |
| Core → Questões | Buscar snapshots em lote para novas referências de autoria | Credencial serviço-a-serviço; IDs e revisões das questões; DTO privado contendo conteúdo resolvido, chave, explicação e vínculo de imagem imutável. Core autoriza staff antes da busca, persiste cópia própria e revalida revisão, sessão, vínculo e idempotência no commit. Sem callback para Core e sem transação distribuída. |
| Core → Questões | Conferir vínculo de uma nova referência de questão | Endpoint folha privado; questão/versão existe e é utilizável; Core faz autorização de tentativa/avaliação e não confia em uma decisão de acesso delegada ao catálogo. Referências e snapshots já persistidos continuam reproduzíveis se Questões estiver indisponível. |
| Core → RabbitMQ → Email | Email de confirmação, recuperação e solicitações habilitadas | Evento versionado e com ID único, outbox transacional no Core, deduplicação no Email, credencial/segredo nunca nos eventos de log ou resposta. Retentativa e DLQ observáveis. |

### Regra específica para prática bloqueada por tentativa avaliativa

Somente `POST /questions/{id}/practice` precisa consultar Core depois de resolver a questão e validar a alternativa, imediatamente antes de decidir se devolve a correção. `GET /questions` e `GET /questions/{id}` não consultam tentativas e continuam retornando enunciado/opções seguras. A consulta Core decide em conjunto sessão atual e existência de tentativa viva/não enviada, de quiz publicado e atribuído, que contenha aquele ID em `questionOrder`/snapshot. Ao iniciar tentativa concorrente antes dessa decisão, prática retorna 409 sem correção. Revogar/inativar sessão resulta em 401; remover apenas matrícula/atribuição retira a condição de bloqueio, portanto sessão ativa ainda pode praticar questão ativa (200), sem ler snapshot ou resultado acadêmico. Se decisão válida ocorreu primeiro, a requisição pode ser ordenada antes da alteração concorrente. Não criar lock distribuído: o ponto de decisão é a introspecção serializada pelo Core.

Preservar precedência de validação pública atual: sessão inválida (401) precede dados ocultos; recurso removido/oculto (404), depois escolha inválida (422), depois prática bloqueada por avaliação (409). Falha/timeout da introspecção retorna indisponibilidade (503), sem resposta de correção ou sucesso fabricado. Se o catálogo puder ser editado concorrentemente, validar revisão monotônica antes/depois da decisão e repetir uma vez de forma limitada, sem manter lock durante RPC.

## Fronteiras que não cruzam schemas

- Core tem role SQL apenas em `core`; Questões apenas em `questions`; Email apenas em `email`. Migrations são executadas por owner do schema correspondente.
- Questões nunca consulta matrículas, provas, usuários ou tokens por SQL. Recebe somente decisão mínima de Core e nunca persiste tentativa/nota.
- Core nunca consulta tabelas de Questões diretamente. Captura snapshots por API interna e guarda a cópia e o ativo de imagem estável no schema/armazenamento Core.
- Email não é fonte de identidade nem de confirmação. Após entrega da mensagem, o usuário conclui o token em Core.
- Nenhuma interface privada deve ser confundida com gateway, proxy público, BFF, integração frontend ou operação navegável.
