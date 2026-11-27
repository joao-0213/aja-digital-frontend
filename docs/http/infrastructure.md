# Infraestrutura HTTP — AJA-04

> **Registro histórico da fundação AJA-04.** Descrições de “etapas seguintes”, provider anterior e API pública limitada à saúde descrevem o estado em que este documento foi escrito; não descrevem o sistema atual. Para manutenção e operação vigentes, consulte [README.md](../../README.md), [ARQUITETURA.md](../../ARQUITETURA.md), [operator.md](operator.md), [contract.md](contract.md) e [storage-inventory.md](storage-inventory.md). O frontend atual usa sessão HTTP e aponta por padrão para o gateway integrado em `http://127.0.0.1:3002/api/v1` (mantendo o JSON Server separado apenas como mock local explícito em `http://127.0.0.1:3102/api/v1`, sem provider ou fallback de estado local). As garantias de fila, validação e persistência abaixo continuam sendo o contrato interno do mock em `server/`.

Esta etapa entrega mecanismos compartilhados e testes contra HTTP real. O processo público continua expondo apenas saúde até as fatias seguintes: não há endpoint de teste, cabeçalho para escolher ator ou receita de mutação enviada pelo navegador. Sessões reais entram em AJA-05; permissões concretas e DTOs de cada recurso entram com suas integrações.

## Cliente

`src/lib/http-client.ts` cria o transporte com a URL pública definida antes do build. Caminhos são relativos ao prefixo da API, começando com `/`; destino externo e travessia para fora da base são recusados. O transporte inclui cookies, não usa cache institucional e não repete comandos automaticamente. JSON, resposta vazia e Blob possuem caminhos próprios. `HttpError.kind` distingue sessão, negação, conflito, validação, indisponibilidade, timeout e cancelamento.

`src/lib/http-query.ts` controla uma consulta ativa. `src/hooks/use-http-query.ts` adapta esse ciclo ao React. O chamador fornece uma identidade de sessão que muda em cada entrada/saída e uma chave com todos os filtros. O loader estável recebe AbortSignal e chama o transporte real. Nova identidade oculta o resultado anterior antes dos efeitos; a geração da consulta também descarta resposta tardia se o loader ignorar aborto. Retry e invalidação fazem uma nova leitura; falha não restaura seed ou snapshot de outra conta. As features migradas devem invalidar seus leitores dependentes após um comando confirmado.

O provider e as features anteriores permanecem intactos nesta etapa para não combinar suas bases com HTTP. AJA-05 liga a identidade da consulta à sessão real; as demais fatias substituem leituras e todas as escritas do respectivo recurso.

## Serviço

`server/transaction-store.mjs` é a fronteira de gravação das futuras fatias. Uma única instância do processo da API deve possuir a base. Stores do mesmo processo compartilham fila pelo caminho real do arquivo; cada operação lê o disco ao obter a fila. Validação e alterações ocorrem em cópia isolada, dentro de callback síncrono. Persistência usa arquivo temporário e rename; falha não publica cópia parcial. O repositório da AJA-03 continua responsável por inicialização/reset, com a API parada para reset.

`server/command-service.mjs` recebe resolução de ator e políticas confiáveis definidas no serviço. Não recebe callbacks do cliente. Resolve conta e acesso atuais antes de revisão ou replay, aplica revisões esperadas, projeta os campos permitidos e mantém auditoria junto da gravação. Autorizações de domínio reutilizam regras puras; nunca autorizar pelo cargo/ID informado no corpo. As rotas devem declarar seus campos graváveis e validar regras específicas; o mecanismo genérico não substitui o contrato de cada comando.

Os testes montam rotas documentadas em um servidor privado com atores controlados. Isso permite verificar concorrência e revogação sem antecipar um login de produto ou expor um bypass em `server/index.mjs`. `tests/http-stack.test.mjs` usa o cliente real contra esse serviço e confere sessão ausente, projeção e conflito concorrente. Requisições independentes e perda de conexão exercitam as garantias do serviço; elas não comprovam cookies nem uma jornada de navegador, que serão validados na integração de sessão e telas.
