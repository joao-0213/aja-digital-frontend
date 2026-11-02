# AJA-04 — serviço de comandos e persistência

Revisão inicial `683137b`. Escopo: `server/transaction-store.mjs`, `server/command-service.mjs`, `server/synchronous.mjs`, `tests/http-consistency.test.mjs`. Entradas públicas de produção permanecem em `server/app.mjs`/`server/index.mjs`, ainda limitadas a saúde. AJA-05 conectará sessão real; os handlers de domínio serão integrados nas fatias seguintes.

## Arquitetura e limites

O store serializa operações por caminho real do arquivo, compartilhando a fila entre instâncias no mesmo processo. Em Windows normaliza caixa após resolver o caminho real. Cada operação lê o disco dentro da fila, prepara clone, executa validação e alterações síncronas e persiste o conjunto por arquivo temporário e rename. Falha antes da substituição conserva o banco inteiro anterior. Arquivo temporário é removido inclusive na falha. Não há estado em memória publicado antes da persistência.

O serviço recebe políticas e seletores explícitos de handlers confiáveis; nunca recebe um callback de mutação do navegador. Resolve a identidade injetada, confere se a conta continua ativa e autoriza com regras atuais antes de consultar revisão, conflito ou repetição. Campos de resposta passam por projetor explícito. O harness reaproveita `canManageSubject` puro do domínio; a infraestrutura não duplica essa regra nem importa seed no frontend. Next permanece estático e a API continua um processo separado conforme a skill `arquiteto-nextjs`.

Comandos validam revisões, alteram múltiplos registros, incrementam revisões/metadados e adicionam auditoria mínima no mesmo clone. Auditoria contém ator, coleção, ID, ação e instante, sem corpo de texto, resposta ou credenciais. Repetição usa chave vinculada ao ator, operação, alvo e fingerprint SHA-256 de JSON canônico (ordem de propriedades irrelevante). Somente o **DTO já projetado** é persistido junto ao comando, nunca o resultado privado bruto ou payload original. Replay reautoriza ator/contexto corrente; não reaplica ao DTO um projetor que espera o registro bruto. Todo handler que aceitar uma chave de idempotência deve fornecer explicitamente `replayProject(dto, ator, estadoAtual)` para reconstruir/reduzir a resposta conforme os campos autorizados naquele momento. A falta dessa política é erro de configuração e não grava nada. Mesmo sem mudança do cargo, a retirada de um escopo secundário deve remover campos dependentes desse escopo. Handlers de comprovante imutável podem declarar projeção identidade após a autorização corrente, por decisão explícita do domínio. Uma chave reutilizada pelo mesmo ator para corpo/operação/alvo diferente dá 409. Registros de intenção expiram após 24 horas e são removidos dentro de uma transação posterior bem-sucedida. Recibos e unicidade de entregas duráveis pertencem aos registros de domínio e devem continuar válidos depois desse prazo.

Esta fila cobre o processo único de JSON Server. Não pretende coordenar múltiplos processos gravando o mesmo arquivo, ferramentas externas ou reset concorrente. O operador deve parar o serviço antes do reset. Nas fatias migradas, comandos devem usar o store como único escritor; acesso lowdb do repositório legado serve preparação/inspeção e não deve virar uma segunda via de gravação concorrente. O adaptador de persistência injetável é para testes de falha e deve preservar o contrato atômico.

## ECC TDD e testes HTTP reais

RED: `node --experimental-strip-types --test tests/http-consistency.test.mjs`, exit 1, `ERR_MODULE_NOT_FOUND` de `server/transaction-store.mjs`. Os testes de contrato foram escritos antes dos módulos de produção e permaneceram na árvore.

GREEN: mesmo comando, **13/13 PASS**, zero falhas/skips. Em conjunto com `tests/http-stack.test.mjs`, **14/14 PASS**. O harness roda um app HTTP real em porta efêmera, com banco privado em diretório temporário. Os dois atores docentes enviam requisições independentes por HTTP; os hooks de controle e cabeçalhos de ator existem somente no arquivo de teste. Nenhum header, endpoint, variável de ambiente ou rota de teste foi adicionado ao processo de produção.

Regressões adicionais da revisão: projetor derivado aplicado duas vezes apresentou RED `500 !== 200`; expiração da intenção apresentou RED `409 !== 200`; ambos corrigidos e GREEN. Regressão de callback de autorização acidentalmente assíncrono apresentou RED `200 !== 500`; serviço agora recusa callbacks assíncronos antes de persistir e o caso passa. Teste do writer atômico simula falha de rename, confirma bytes anteriores intactos e ausência de temporários. Coordenador executou suíte completa: **161/161 PASS**.

Revisão final exigiu política obrigatória de replay: RED `200 !== 500` sem `replayProject`; após correção PASS. Teste de mesmo cargo com escopo secundário retirado confirma que o DTO de repetição não conserva campo revogado. Callback `apply` assíncrono com rejeição também apresentou RED por rejeição não tratada; guard compartilhado agora observa/rejeita promises em todos os callbacks (ator, política, alvo, revisões, seleção, aplicação, projeções e mutação do store), sem permitir commit nem derrubar o processo. GREEN final 13/13.

Casos observados:

- Sem ator/conta inativa: 401; docente desatribuído por ID direto: 403; leitura autorizada retorna somente id/nome/revisão.
- Dois docentes com revisão 1: uma resposta 200 e uma 409; disciplina e módulo avançam juntos para revisão 2, com dois eventos de auditoria.
- Revogação segura a fila em um gate de persistência. A requisição docente já recebida fica aguardando; ao liberar o gate, enxerga a atribuição revogada e recebe 403, sem metadados de conflito ou gravação.
- Persistência com falha: 500 `PERSISTENCE_FAILED`, banco no disco intacto, incluindo revisões, auditoria, idempotência e tentativa de envio; a fila permanece utilizável para leituras.
- Perda real da resposta: harness destrói o socket ao responder depois do commit; fetch rejeita. Repetição com mesma intenção retorna comprovante preservado, com um único commit/evento. Payload com ordem de campos diferente mantém fingerprint; corpo/alvo diferente conflita; outro ator não obtém resultado alheio; conta revogada não recebe replay.
- Duas instâncias de store sobre o mesmo arquivo compartilham o lock e preservam as duas alterações, verificando estado mais recente em vez de snapshots independentes.

O harness usa caminhos de operações documentadas para exercitar a infraestrutura, sem implementar antecipadamente todos os comportamentos de disciplina/envio. Resultado de tentativa, prazo, correção, autorização de arquivo, sessão HttpOnly e UI continuam sujeitos às respectivas issues. Não há medição percentual de cobertura. Gates globais, integração do cliente e revisão independente final são registrados pelo coordenador no fechamento da AJA-04.
