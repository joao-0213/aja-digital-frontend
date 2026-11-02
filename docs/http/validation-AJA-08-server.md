# AJA-08 — arquivos, materiais e progresso no serviço

Revisão inicial `25c823f`. Arquivos: novos `server/file-service.mjs`, `server/material-policy.mjs`, `server/material-service.mjs`, composição em `server/app.mjs`, exportação de projeções já existentes em `server/subject-service.mjs` e `tests/http-materials.test.mjs`. Sem alteração de package/dependências, contratos, frontend, runtime ou build pelo implementador do serviço.

## Transporte, autorização e armazenamento

Uploads usam multipart real (`purpose`, `parentId`, `file`), consumido pelo parser nativo `Request.formData()` após autenticação e leitura limitada. Não há JSON/base64 no contrato público. Campo repetido, arquivo repetido ou campo extra é rejeitado. O ator é resolvido antes de consumir o corpo; como o contexto está nos campos multipart, pai/permissão são conferidos após o parse e novamente dentro da transação mais recente. Revogação enquanto o corpo chega impede o commit.

Para esta API local JSON Server, bytes novos são base64 **privados** na própria linha de `files` em `server/runtime/db.json`. Metadados, bytes, vínculo, revisões, auditoria e intenção são substituídos por um único rename atômico do store AJA-04. Não há arquivo público/sidecar nem janela de commit entre bytes e metadados; falha de persistência deixa ambos no estado anterior. Interrupção antes do commit só perde buffers em memória. Isso não promete durabilidade contra falha física do disco ou escala de armazenamento de produção: uploads e banco completo são processados em memória, com expansão de base64. A solução é deliberadamente local e deve ser substituída pelo serviço de arquivos na integração real.

O nome original nunca vira caminho de arquivo. Os fixtures legados só são lidos de manifesto fechado (`proporcoes.pdf`, `grupos.png`), recusando caminhos arbitrários e symlinks. DTOs explícitos não retornam bytes, hash, chave de intenção, caminho de fixture ou proprietário interno. A finalidade interna de questão permanece inacessível por `/files` até AJA-09; não foi acrescentada ao upload público.

Preparação de material exige docente atribuído/admin em módulo de turma ativa; arquivo preparado pertence somente à conta que enviou e àquele contexto. Ao publicar, seu pai muda de módulo para o material gerado. Arquivo anexado é autorizado pelo recurso pai atual, não pelo estado da conta que o enviou: aluno autorizado e outro docente podem ler material publicado após inativação do autor. Pai/registro retirado, matrícula encerrada, atribuição revogada, bytes ausentes e ID fora do escopo retornam indisponibilidade, sem fallback local.

O mecanismo compartilhado já aceita preparação de trabalho no contexto de atividade publicada atribuída ao aluno, e de fórum no contexto de disciplina ativa autorizada; não cria entrega/tópico ou implementa suas jornadas. Leitura de anexo de trabalho é individual para o aluno e exige atividade publicada; equipe autorizada pode consultar histórico enviado. Anexo de fórum exige que tópico/disciplina/turma correspondam. Essas regras não ampliam acesso por conhecer o ID do arquivo.

## Limites e resposta binária

- Materiais: PDF não vazio, assinatura `%PDF-`, extensão `.pdf`, até **10 MiB**. Ausência de MIME do navegador ou `application/octet-stream` só normaliza para PDF quando assinatura e extensão concordam; MIME conflitante como HTML continua recusado.
- Fórum: PDF/PNG/JPEG/WebP não vazio, MIME/extensão/assinatura compatíveis, até **5 MiB**. Trabalho: arquivo livre até **10 MiB**, inclusive zero bytes conforme a regra anterior.
- Envelope multipart: tamanho real máximo de **10 MiB + 64 KiB** para fronteiras, cabeçalhos e campos; Content-Length não é a única fonte de validação. Nome: até 255 bytes UTF-8, sem caminhos ou controles. Erros de limite/parse são 422 `VALIDATION_ERROR`, sem resposta 413 especial.
- JSON mantém o limite existente de **10 MB** do `json-server/lib/server/body-parser.js`; não foi criado limite de caracteres adicional para conteúdo de material. Título tem até 160 caracteres e duração de estudo fica entre 1 e 600 minutos, conforme controles existentes.
- Download devolve bytes autenticados, Content-Type seguro, `X-Content-Type-Options: nosniff`, Content-Disposition com escaping e filename UTF-8, além de `Cache-Control: no-store` herdado do app. Prévia inline só usa formatos reconhecidos; HTML/SVG e demais formatos livres de trabalho são forçados a attachment/octet-stream. Validação de assinatura não é antivírus nem um parser completo do documento.

## Preparação, repetição e limpeza

Preparações expiram após **24 horas**. Manutenção confiável oportunística em operações de arquivo/material elimina bytes de preparações expiradas de qualquer proprietário, incluindo contas abandonadas/inativas. Apenas preparação expirada é atingida; anexados não expiram por essa política. Em servidor ocioso, a remoção física no JSON aguarda uma operação posterior, embora leitura/uso já sejam vedados após o prazo. Não há timer ou endpoint público de manutenção.

Descarte explícito e limpeza após falha de publicação só atingem preparação própria, finalidade material e contexto correspondente. Falha definitiva 403/404/422 limpa os arquivos próprios referenciados; arquivo alheio, já anexado ou reutilizado não é removido. Erro 409 de revisão preserva preparação para conferência/nova intenção; conflito de idempotência e erro 500 também não provocam descarte destrutivo. Uma falha de persistência conserva o estado validado anterior, inclusive os bytes preparados.

Tombstones privados retêm ID, proprietário e fingerprint/chave da intenção sem conservar bytes. Replay de preparação descartada/expirada recebe 404, mesmo depois da expiração geral do cache de idempotência; para enviar novamente, é preciso nova intenção. Chave com bytes ou metadados diferentes conflita. A chave é associada ao ator/operação: outra conta não herda intenção ou preparação. Tombstones operacionais ficam até reset do operador.

## Materiais e progresso

Listagem/detalhe só usam material/módulo/disciplina vivos e autorizados. O detalhe retorna `{ material, module, subject, canManageContent }`, reutilizando as projeções da AJA-07. Lote tem de 1 a 10 itens e valida todos antes de anexar/publicar; cada módulo interno deve corresponder ao externo, arquivo de outra conta/finalidade/contexto não é reutilizado e o mesmo arquivo não pode servir a dois itens. O commit inclui materiais, arquivos, revisão estrutural do módulo e auditoria. Edição conserva tipo/arquivo/autoria, rejeita vídeo novo inseguro e permite editar metadados de vídeo legado sem obrigar URL que não existia. Reordenação compara pai e conjunto completo de filhos/revisões, com resposta paginada e sem substituir o conjunto pelo recorte da página.

Progresso é identificado pela conta da sessão e material visível. Omitir `completed` registra último acesso monotônico preservando conclusão; `true` conclui sem desmarcar nem alterar acesso já existente. Repetir conclusão já efetiva não muda revisão, auditoria, quantidade de registros ou estado de domínio. Novo registro recebe acesso inicial do servidor. Cabeçalhos de intenção, quando fornecidos, têm seus registros de infraestrutura separados; o teste de repetição natural usa o PATCH sem chave, como o contrato não exige chave nessa operação. As ferramentas opcionais de estudo consumirão essas mesmas operações, sem escrita paralela.

## ECC RED/GREEN e evidência efetiva

Comando: `node --experimental-strip-types --test tests/http-materials.test.mjs`.

- RED antes de produção: **9/9 falharam**, por rotas ausentes (404 em vez de 201/403/422/500/200 e detalhe sem material).
- Implementação inicial: 8/9; o único caso restante era o harness emitindo uma chave de intenção **nova** em cada repetição de progresso e comparando também o ledger de intenções. Corrigido o harness para o PATCH natural sem header, sem remover a verificação de revisão/auditoria/estado do domínio.
- MIME legado: RED `422 !== 201` para PDF válido com MIME ausente; normalização limitada a extensão/assinatura resolveu. Atividade em rascunho: RED `200 !== 404` para arquivo de trabalho do aluno; autorização do pai publicado foi corrigida.
- Nome UTF-8: RED em Content-Disposition, que deixava apóstrofo sem escape em `filename*`; corrigido para RFC 5987 com `%27` e demais caracteres reservados.
- Contexto do fórum inconsistente: RED `200 !== 404` ao tópico apontar turma diferente da disciplina; corrigida a verificação do pai.
- GREEN final ampliado: **15/15 PASS**, zero falhas/skips. Em conjunto com sujeitos/consistência (`tests/http-subjects.test.mjs tests/http-consistency.test.mjs`): **36/36 PASS**. Após reforçar a prova de rejeição sem consumir corpo não autenticado, o caso focado passou novamente **1/1**.

Verificações observadas: dois navegadores autenticados transferem bytes exatamente iguais ao fixture; nome/MIME/assinatura/tamanho, limite exato de 10 MiB e limite real de chunked; duplicatas de campos/arquivos; chave vinculada ao conteúdo real; descarte/expiração sem ressurreição; limpeza de arquivo abandonado de conta inativa; lote parcial, arquivo estrangeiro/anexado/duplicado; rollback integral de bytes/metadados/módulo/auditoria/intenção; edição/revisão/reordenação e vídeo legado sem URL; progresso isolado entre contas e compartilhado por sessões da mesma conta; cache no-store; pai publicado/retirado/inconsistente e autor inativo; upload com corpo lento após revogação; requisição anônima só com cabeçalhos recebe 401 sem precisar enviar o corpo prometido; HTML livre forçado a download e finalidade de questão fechada.

Gates globais, contrato, teclado/browser/responsividade, Graphify e revisão independente final são registrados pelo coordenador. Não há percentual de cobertura medido. Sessões, operações de fórum/trabalho e autorização de questões nas issues posteriores não são consideradas concluídas por estes testes de mecanismo compartilhado.
