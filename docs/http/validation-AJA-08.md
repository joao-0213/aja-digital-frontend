# AJA-08 — materiais e arquivos HTTP

Base inicial `25c823f`. Entradas: `/materiais?id=…`, materiais no detalhe da disciplina, publicação/edição/ordenação, progresso e ferramentas de estudo opcionais. Dependência AJA-07 concluída/revisada. Aplicados ECC TDD/verification, arquiteto-nextjs, orientação instalada Next e consulta Graphify antes de fontes.

## Critérios

- Upload multipart, preparação, metadados, download autenticado e descarte de arquivos por finalidade/contexto/dono, sem coleção bruta ou paths públicos. PDF até 10 MiB, dez itens por lote conforme legado; limites dos demais usos preservados no serviço compartilhado.
- Publicação em lote atômica; validar todos os itens antes de publicar, limpar preparação órfã em falhas confirmadas, preservar composição/arquivos para repetir. Resultado de rede incerto exige reverificar a mesma intenção antes de gerar outra publicação.
- Docente publica em uma sessão; aluno autorizado abre/baixa os mesmos bytes em outra e conclui. Arquivo ausente, ID adivinhado, finalidade alheia, lote parcialmente inválido, vídeo legado sem URL, repetição e acesso revogado têm resultados verificáveis.
- Consulta e edição de texto/PDF/vídeo externo, escolha antes de carregar provedor, retorno ao módulo, ordenação com revisões e progresso privado por conta. Ferramentas opcionais usam os mesmos serviços; ausência/erro de registro não bloqueia tela.
- Static export/Suspense preservados, sem Server Actions. Não ler/escrever banco legado ou IndexedDB como transporte alternativo; conservar dados antigos intactos.

## Decisão de armazenamento local

Novos bytes podem ser armazenados em base64 **privado dentro do JSON transacional**, junto dos metadados. Isso permite rollback/crash com o mesmo rename atômico, sem sincronizar dois arquivos. O upload do navegador continua multipart binário; DTOs jamais retornam base64, caminho interno ou coleção bruta. Fixtures existentes usam manifesto fechado do serviço. É uma escolha para o JSON Server local, com custo de memória/tamanho do banco documentado; não constitui storage de produção.

## Plano de validação

RED/GREEN focados antes da implementação; contratos/exemplos alinhados; suíte completa, tipos, arquitetura, build padrão e fallback separado se necessário; requests reais e binário/checksum, duas sessões com negação/revogação/conflito; recarga/falha/repetição, teclado e 390/768/1440; Graphify e revisão independente do diff completo. Critérios verificados conforme os resultados e limites abaixo.

## Checkpoints iniciais

Servidor: `node --experimental-strip-types --test tests/http-materials.test.mjs` apresentou RED antes da implementação, com nove falhas (upload, lote, progresso, detalhe e upload lento). A nota do servidor registra os resultados específicos. Os testes foram incluídos em `npm test`, sem nova dependência.

Revisão antecipada encontrou continuação de uploads após troca de sessão. Cliente reproduziu RED (quatro PASS e um FAIL, Missing expected rejection); a captura de sessão e geração tornou o teste focado GREEN (5/5). Ferramentas opcionais receberam proteção equivalente.

Revisão independente encontrou compartilhamento indevido da preparação pendente entre criação e edição. RED: `node --experimental-strip-types --test --test-name-pattern="editing never reads" tests/materials-client.test.ts`, teste `editing never reads, clears or discards the pending publication of the same module on save or cancel`, falhou com `ERR_MODULE_NOT_FOUND` antes de introduzir a fronteira testada. GREEN: mesmo comando, 1/1 após implementação. No navegador, publicação real 201 com resposta perdida, edição salva 200 e outra cancelada preservaram a intenção; conferência repetiu chave/corpo e retornou 201 com os mesmos IDs.

## Gates após correção

`npm test`: 254/254; `npm run typecheck`: aprovado; `npm run check:architecture`: 171 módulos, sem ciclos; `npm run build` padrão Turbopack: aprovado com API desligada, sem fallback. OpenAPI validado e 839 exemplos sem erros; `git diff --check` sem erros (avisos de finais de linha). Export estático exercitado com API isolada: login, PDF, conclusão e recarga. Veja a nota de navegador para cenários e limites. Revisão final independente `review_aja08_sol` (gpt-6.1-sol, médio): APPROVE, zero achados pendentes, após correções e revalidação por executores gpt-6.1-terra, médio. O build da correção final foi repetido com portas 3000/3002 sem listeners e nova leitura estática após reiniciar a API.
