# AJA-08 — materiais, arquivos, progresso e ferramentas no cliente

Base: `25c823f`. Registro dos adapters, coordenador de publicação, componentes de materiais, integração no detalhe da disciplina e ferramentas opcionais. API, navegador, revisão independente e gates completos são consolidados pelo agente principal.

## Fronteiras

Aplicados `AGENTS.md`, `ARQUITETURA.md`, ECC TDD/verification-loop, `arquiteto-nextjs` e orientações locais Next.js de static export e fronteira Server/Client Components. A exportação continua estática; não há busca autenticada no build nem backend/Server Action no Next.js.

`src/lib/http-files.ts` transporta File/FormData, metadados e bytes, sem regras de feature ou import institucional. `features/materials/api.ts` define DTOs explícitos e contexto MaterialDetail. Tipos de disciplinas são importados pela entrada pública e apagados em runtime; navegação consulta endpoints tipados, evitando ciclo `subjects → materials → subjects`. `ModuleMaterials`, exposto pela entrada pública, substitui a indisponibilidade dos materiais no detalhe; atividades e mural continuam aguardando suas próprias issues.

Materiais migrados não leem nem escrevem IndexedDB/localStorage. Chaves e blobs anteriores permanecem intactos. Formulário, arquivos selecionados e intenção pendente ficam somente no buffer em memória da sessão verificada, separados por contexto e revisão aberta. Não há banco institucional local nem envio automático de dados antigos.

## RED/GREEN observados

1. Criado `tests/materials-client.test.ts` antes do coordenador/adapter de arquivos. `node --experimental-strip-types --test tests/materials-client.test.ts`: RED, `ERR_MODULE_NOT_FOUND` de `material-publication.ts`. Após implementação, GREEN, quatro casos iniciais passaram. Esse primeiro RED é de implementação ausente, sem execução individual dos casos.
2. Revisão identificou risco real de continuação entre contas. Novo caso `publication never continues a late upload into a different session even when its transport ignores cancellation`: upload inicial da sessão A ficou pendente; após mudar para B, o transporte liberou a resposta antiga. RED efetivo: quatro passaram/um falhou, `Missing expected rejection`; código anterior continuava o segundo upload e batch. A primeira tentativa do teste ficou pendente porque o fake também aguardava o segundo upload; foi encerrada pelo handle do próprio teste e o fake corrigido para permitir observar a falha terminal. Correção vincula a sessão inicial, geração e AbortSignal e verifica antes/depois de cada etapa, inclusive validação assíncrona, upload, limpeza, batch e retorno. GREEN no mesmo teste, sem escrita posterior por B.
3. Antes da factory pura de ferramentas, teste de callback antigo após troca de sessão deu RED por módulo `study-tools.ts` ausente. Factory implementada com fence da inscrição/execução, verificações a cada página/consulta, antes/depois de PATCH e antes de declarar sucesso. Casos de leitura e conclusão tardias passam e não consultam progresso, concluem ou revalidam a conta seguinte.
4. Caso `explicit HTTP 413 is a definite upload rejection, keeps the selection editable and consumes no pending intent`: RED real, seis passaram/um falhou (`uncertain` true em vez de false). Corrigida classificação de rejeição 413 como definitiva, preservando seleção editável. Serviço normaliza seus limites para 422; o caso também protege respostas de infraestrutura que usem 413.
5. Execução final `node --experimental-strip-types --experimental-test-coverage --test tests/materials-client.test.ts tests/material-video.test.ts tests/administration-client.test.ts tests/session-client.test.ts tests/subjects-client.test.ts`: 36/36 passaram, incluindo dez casos específicos de materiais. Cobertura dos módulos carregados: 95,49% linhas, 82,08% branches, 82,3% funções. Coordenador: 89,57% linhas/82,76% branches; ferramentas: 100% linhas/88,89% branches. Esses valores não incluem montagem de React nem o adapter de materiais ainda não importado diretamente por essas suítes; não representam cobertura completa da interface.
6. `npx.cmd tsc --noEmit`: exit 0 final. Uma execução intermediária encontrou apenas a cópia histórica `tmp/aja02-clean-checkout` dentro do glob de tipos, importando a assinatura antiga do hook por alias; o agente principal preservou esse artefato fora da raiz tipada, sem mudar fontes/configuração para esconder erro de produção. `npm.cmd run check:architecture`: exit 0, 170 módulos e nenhum ciclo. Não foram iniciados build/Graphify/processos de aplicação por este agente.

## Publicação e repetição segura

Todo o lote de PDFs é conferido antes do primeiro upload: 1–10 arquivos, não vazios, até 10 MiB cada, extensão/MIME compatíveis e assinatura `%PDF-`. MIME vazio do sistema operacional é aceito no cliente; FormData nativo preserva nome/bytes e o serviço normaliza apenas PDF validado. Não existe conversão de arquivo para JSON/base64 no navegador. Texto/vídeo usam o mesmo comando de lote com um item; URL nova exige HTTPS sem credenciais.

Cada arquivo preparado possui intenção de upload estável; lote captura revisão do módulo e uma intenção própria. Perda de resposta/timeout congela os campos, arquivos, revisão e payload daquela operação. “Conferir publicação” repete a mesma intenção; não envia uma criação diferente nem descarta bytes que podem já estar anexados. Resposta definitiva inválida/sem acesso/arquivo ausente limpa preparações conhecidas e permite nova preparação com novas chaves, preservando File/texto. Conflito de revisão conserva os arquivos preparados para conferência explícita do pai, usando nova intenção de batch após reconhecer a revisão. Falha de persistência confirmada conserva os estágios; nenhuma confirmação local de publicação é produzida.

Coordenador captura a sessão original, aborta ao desmontar e impede novas etapas mesmo se o transporte ignora aborto e devolve uma resposta antiga. Callbacks de buffer continuam vinculados à chave esperada. Limpeza tenta somente IDs recebidos de uploads próprios desse preparo; jamais recebe ator do formulário ou remove arquivo anexado após resultado desconhecido. Preparações desconhecidas/inacessíveis ficam sob a limpeza do serviço e seu TTL, sem afirmar descarte HTTP que não ocorreu.

`HttpEditor.submit` teve apenas sua assinatura de callback de gravação ampliada para Promise<unknown>, pois o resultado já era ignorado pelo runtime; leitura de revisão continua tipada. Assim o batch retorna sua página real, enquanto a conferência usa o módulo real, sem fabricar um recurso/revisão para satisfazer tipo.

## Leitura, organização e progresso

Leitor mantém índice completo de módulos/materiais, título e ordenação do serviço, retorno à aba/âncora do módulo e link de dúvida contextual. PDF vem de GET autenticado de bytes; Blob URL é criado somente após sucesso e revogado ao trocar dado/desmontar. Arquivo ausente ou sem acesso exibe erro/repetição, sem arquivo textual inventado. Download usa nome do DTO. Resumo TXT continua derivado exclusivamente do conteúdo já autorizado, como exportação local de leitura.

Vídeo usa o componente anterior: fonte externa só carrega por escolha, incorpora apenas provedores reconhecidos e conserva alternativa externa. Material legado sem URL continua legível e permite editar metadados mantendo a ausência, sem inventar uma fonte. Edição não troca tipo/arquivo/autoria; usa revisão e conferência de conflito.

Materiais do módulo são lidos em todas as páginas autorizadas, sem corte de 100. Reordenação envia revisão do módulo e de todos os materiais; resposta paginada não substitui o conjunto. Falha conserva a sequência anterior; conflito oferece ordem atual separada e exige conferência antes de novo gesto.

Último acesso é PATCH real de `/me/progress` com materialId; conclusão acrescenta `completed: true`. Não existe operação local de concluir nem `false` para desfazer. Indicador é lido do serviço, nova tentativa gera requisição real e confirmação só aparece após resposta de sucesso. Filtros/sessão/epoch descartam respostas antigas. As permissões de aluno/docente/admin continuam decididas no serviço.

## Ferramentas opcionais

Providers registra `read_study_materials` e `complete_study_material` apenas para sessão autenticada. Ausência, erro ou rejeição assíncrona do registro não bloqueia a UI. Registro abortado mantém fence próprio: callback antigo não usa um ref de usuário novo. Antes de executar, revalida a sessão; leitura percorre todas as páginas de materiais/progresso autorizados; conclusão usa o mesmo PATCH da interface. Input extra, inclusive userId, é recusado.

Não há polyfill obrigatório, seed, manipulação da base ou sucesso simulado nas ferramentas. Conclusão atrasada de outra geração não devolve sucesso nem atualiza a próxima conta. Atualização de recursos após sucesso revalida a sessão sem trocar a identidade do editor quando a sessão verificada é a mesma.

## Limites da evidência deste agente

Testes de protocolo usam HTTP real efêmero para multipart/bytes; não substituem as jornadas de navegador contra a API da issue. Agente principal verificará docente publicando e aluno abrindo em sessões independentes, assinatura/bytes/cabeçalhos, recarga, falhas/interrupção, conflito, revogação, ferramentas reais quando disponíveis, teclado e tamanhos de tela. Esses resultados e revisão final devem constar no registro principal. A fonte foi congelada e `/materiais` habilitado após os checks próprios; nenhum domínio posterior foi declarado migrado.
