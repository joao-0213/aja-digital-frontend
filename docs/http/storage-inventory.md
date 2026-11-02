# Inventário de persistência e corte HTTP

Referência: AJA-01, revisão inicial `e169df6`. Este documento define o destino; não afirma que a migração já ocorreu. A instalação HTTP nova começa exclusivamente com a massa versionada do serviço. Nenhum dado do navegador é importado, mesclado, apagado ou enviado automaticamente. O titular abaixo é o ator a quem o dado pertence; a instituição mantém os registros acadêmicos e o serviço aplica as permissões.

## Armazenamento do navegador

| Meio e chave atual | Conteúdo e titular | Destino e issue |
| --- | --- | --- |
| localStorage `aja-digital-demo-v1` | JSON `MockDatabase`, todas as contas locais | Preservar intacto como legado; coleções novas no JSON Server conforme tabela abaixo. AJA-17 remove consumo e escrita pela aplicação HTTP. |
| sessionStorage `aja-demo-role` | Perfil simulado da aba | Preservar legado; retirar consumo/escrita em AJA-05. Perfil passa a vir da sessão HTTP, nunca autoriza por chave local. |
| sessionStorage `aja-demo-user` | Conta simulada da aba | Mesmo destino; cookie HttpOnly identifica sessão no serviço (AJA-05). |
| localStorage `aja-demo-email` | E-mail lembrado pelo visitante | Legado intacto; se mantida preferência de login, usar nova chave explícita sem senha/token e sem reutilização automática (AJA-05). |
| sessionStorage `aja-attempt-<attemptId>` | Mapa de respostas em digitação, aluno da tentativa | Preservar legado. AJA-11 usa recuperação temporária nova isolada por conta + tentativa + revisão; respostas confirmadas vêm de `/attempts`. |
| sessionStorage `aja-attempt-<attemptId>:questions-updated` | Revisão de questões associada ao rascunho | Mesmo destino; nunca aplicar composição a outra revisão sem conferência. |
| sessionStorage `aja-notice-draft:` + `JSON.stringify([userId, 'edit' ou 'new', noticeId ou subjectId ou 'general'])` | Composição de aviso, conta autora; inclui contexto, ocorrência e revisão | Pode continuar temporário no cliente isolado por conta/contexto/revisão (AJA-13); publicação só via HTTP. Preservar na falha e conferir acesso/revisão ao retomar. |
| sessionStorage `aja-forum-compose:<userId>:<materialId ou questionId ou new>` | JSON título, corpo, tags, anexo, referência e disciplina, conta autora | AJA-14 mantém apenas recuperação temporária isolada também por contexto efetivo; envio/anexo/referência validados no serviço. Não importar legado silenciosamente. |
| sessionStorage `aja-forum-reply:<userId>:<topicId>` | Corpo de resposta, conta autora | AJA-14: recuperação temporária por conta/tópico, com revalidação de acesso; publicação HTTP. |
| localStorage `aja-subject-seen:<userId>:<subjectId>` | Array de assinaturas de publicações vistas, conta leitora | AJA-07: leitura institucional em `/subjects/{id}/visits`, sempre relativa à sessão; manter legado intacto e não enviar automaticamente. |
| IndexedDB `aja-material-files`, versão 1, object store `files`, chave ID do arquivo | `File`/`Blob` de materiais e anexos compartilhados pelos fluxos locais | Preservar banco legado. AJA-08: novos bytes e metadados em `/files`, preparação e vínculo ao recurso pai, download autorizado. AJA-12/14 reutilizam o serviço. IDs locais não são IDs de arquivos HTTP. |

Fontes: `src/lib/demo-storage.ts`, `src/providers/use-demo-state.ts`, `src/features/auth/components/auth-page.tsx`, `src/features/assessments/components/quiz-session.tsx`, `src/lib/announcement-draft.ts`, `src/features/announcements/components/announcement-composer.tsx`, `src/features/forum/components/forum-page.tsx`, `src/features/forum/components/forum-thread.tsx`, `src/features/subjects/hooks/use-subject-updates.ts`, `src/lib/material-files.ts`.

Não há outra chamada de persistência browser em `src/` no inventário inicial. O lock Web Locks `aja-digital-demo-v1:mutation`, o evento `aja-subject-visited`, eventos `storage` e o Map `sessionSeen` coordenam apenas abas/memória: não são armazenamento nem autorização. Estado React de filtros, modal, navegação, formulários e notificações é volátil. A preferência de menu pode continuar local; não foi encontrada chave persistida para menu nesta revisão. URLs de objeto para prévias são transitórias e devem ser revogadas; não substituem arquivos duráveis. AJA-17 deve repetir o inventário antes do corte.

## Coleções do contrato local

Todas as 16 coleções de `src/models/database.ts` têm destino. `version: 1` é metadado do snapshot legado, não coleção nem versão pública da API. Os nomes abaixo são internos ao serviço; não autorizam expor rotas CRUD brutas.

| Coleção | Titular / responsabilidade | Destino HTTP / issue |
| --- | --- | --- |
| `users` | Conta; administração gerencia situação e vínculos | `/auth`, `/me`, `/users`; AJA-05/06. Verificador de senha e tokens somente no serviço, fora de DTOs. |
| `classes` | Instituição; administrador | `/classes`; AJA-06. Encerramento por comando transacional. |
| `subjects` | Instituição; administrador e equipe atribuída | `/subjects`; AJA-06/07. |
| `modules` | Disciplina; docente atribuído | `/modules`; AJA-07. |
| `materials` | Disciplina e autor | `/materials`, binários `/files`; AJA-08. |
| `questions` | Acervo institucional ou autoria restrita à atividade | `/questions`; AJA-09, autoria AJA-10. Gabarito projetado conforme fase e ator. |
| `assessments` | Disciplina e equipe atribuída | `/assessments`; AJA-10. Copiar questões segundo regras atuais. |
| `attempts` | Aluno; equipe autorizada consulta resultados | `/attempts`; AJA-11. Ordem/cópias/respostas/nota/comprovante no serviço. |
| `submissions` (opcional no legado) | Aluno e equipe avaliadora | `/submissions`; AJA-12. Ausência no seed significa vazio, não perda de histórico. |
| `topics` | Autores, leitores autorizados e disciplina | `/topics`; AJA-14. Respostas, votos, leitura e solução permanecem vinculados; auditoria preservada. |
| `announcements` | Instituição, turma ou disciplina e autor | `/announcements`; AJA-13. Ocorrências geram calendário derivado. |
| `events` | Eventos manuais legados | Sem endpoint de escrita; normalizar apenas a massa versionada para ocorrências de avisos com `legacyEventId` e deduplicação; `/calendar` derivado (AJA-03/13). Snapshot browser fica intacto. |
| `attendance` | Aluno e turma; equipe registra | `/attendance`; AJA-15. |
| `progress` | Aluno e material | `/me/progress`; AJA-08. |
| `enrollments` | Aluno e instituição; administrador decide | `/enrollments`; AJA-06. |
| `audit` | Instituição, escrita exclusiva do serviço | Persistência interna atômica com comandos (AJA-04), preservada para rastreabilidade e conferência pelo operador. Sem CRUD público e sem importação do audit browser; qualquer campo apresentado em projeções deve passar pela autorização do serviço. |

Sessões, verificadores de senha, tokens de uso único, caixa de saída local, registros de idempotência, metadados de arquivos e visitas são dados novos do serviço; não existem como coleções próprias no snapshot original. A caixa de saída é acessível ao operador pelo terminal, nunca por coleção HTTP bruta. Relatórios e calendário são projeções dos registros autorizados, sem segunda fonte divergente.

## Relógios e datas

| Fonte inicial | Valor / comportamento | Destino |
| --- | --- | --- |
| `src/mocks/database.ts` | `DEMO_DATE = '2026-10-05'`; publicações, fórum, avisos, prazos, chamada e progresso em outubro/2026 | AJA-03 gera massa relativa à data-base; teste pode fixá-la. Reinício conserva datas e alterações; só reset explícito recompõe massa. |
| `src/features/calendar/components/calendar-page.tsx` | Mês 9, ano 2026 e destaque `2026-10-05` | AJA-13 inicia no mês/dia corrente de Brasília. |
| `src/features/dashboard/components/student-dashboard.tsx` e `staff-dashboard.tsx` | Próximos encontros filtrados por `DEMO_DATE` | AJA-16 usa projeção HTTP e dia corrente de Brasília, sem importar a constante da massa. |
| `src/features/attendance/components/attendance-page.tsx` | Dia inicial `2026-10-05` | AJA-15 usa dia corrente de Brasília. |
| `src/features/assessments/components/assessment-builder.tsx` | Prazo novo `2026-10-20T23:59` | AJA-10 remove data fixa; prazo explícito ou sem prazo conforme regra. |
| `src/lib/demo-storage.ts` | Fallback de evento legado `2026-10-01T12:00:00-03:00` | Apenas compatibilidade da versão anterior; massa normalizada AJA-03 não usa fallback como relógio corrente. |
| `src/hooks/use-activity-clock.ts` e mutações de domínio | Relógio real ISO, atualização a cada segundo na UI | Preservar feedback visual; servidor é autoridade do prazo/instante de gravação (AJA-04/11). |

Datas civis usam `YYYY-MM-DD`; horários pedagógicos são interpretados em `America/Sao_Paulo`; instantes públicos têm offset explícito ou UTC. Dados de teste fixos não viram relógio do produto. Não converter dia civil via UTC para escolher o dia de Brasília.

## Preservação antes do corte

1. Manter a revisão anterior `e169df6` acessível em instalação estática separada, com seu próprio perfil de navegador. Não abrir a versão antiga sobre a origem/perfil em uso pela nova para tentar sincronizar estados.
2. Antes de trocar de origem/perfil, fechar editores da versão antiga após salvar e manter o perfil original intacto. `sessionStorage` dura só a sessão: não encerrar as abas antes de copiar composições que se deseja guardar.
3. Para cópia manual pelo operador, usar DevTools > Application na origem antiga: copiar o valor integral de `aja-digital-demo-v1` para um arquivo JSON local, copiar as demais chaves desejadas de Local Storage e Session Storage e guardar os anexos abrindo/baixando-os na versão antiga. JSON não contém os bytes do IndexedDB. Conferir que os arquivos abrem e que o JSON é legível antes de encerrar a sessão. O perfil original continua sendo a cópia completa dos stores; copiar JSON sozinho não constitui backup completo.
4. Não usar reset da demonstração, limpar site, apagar IndexedDB ou reutilizar o botão antigo de reset durante o corte. O novo `api:reset` atua somente na pasta de execução do serviço e não toca no navegador.
5. A aplicação HTTP não lê as chaves antigas como seed, sessão, cache alternativo ou autorização e não chama a migração browser para inicializar o serviço. Qualquer migração manual futura de dados exige fluxo próprio, revisão de identidade e validação; está fora deste backlog.

Este inventário é documental: não modifica persistência ou regras. A verificação de execução do corte e de ausência de consumo legado pertence à AJA-17/18.
