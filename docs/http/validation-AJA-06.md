# AJA-06 — administração HTTP

Base `fba87ee`. Escopo: usuários/docentes e cargos, turmas, alunos, vínculos e histórico. Entradas `/usuarios`, `/turmas`, `/alunos` e `/alunos/perfil`. ECC TDD/verification, Graphify e `arquiteto-nextjs` aplicados; revisão independente `review_aja01`, sem implementação pelo revisor.

## RED e GREEN

- Servidor: sete regressões iniciais falharam com HTTP 404 nos endpoints ausentes. Implementação ampliada para 19 testes administrativos HTTP, incluindo permissões, último administrador concorrente, rollback, histórico, identidade por conta, matrículas e paginação antes de total. Comandos e falhas em [validation-AJA-06-server.md](validation-AJA-06-server.md).
- Cliente: RED `ERR_MODULE_NOT_FOUND` antes do controlador de edição. GREEN com dez testes de adaptadores/editor: campos e revisão abertos, falha, conflito, conferência explícita, negação e idempotência. Infraestrutura compartilhada por três features, reutilizando `RecordConflict`. Detalhes em [validation-AJA-06-client.md](validation-AJA-06-client.md).
- Infraestrutura: antigo teste esperava 404 em `/api/v1/users`, mas observou 401, pois virou endpoint protegido. Atualizado para exigir 401 nesse endereço e manter 404 em `/users`, `/db` e `/api/v1/credentials`. Mesmo comando: 6/6 GREEN, sem expor CRUD genérico.
- Revisão detectou comparação civil dependente do fuso do processo. Três regressões em UTC falharam nos limites de entrada, saída e legado. Extração explícita em `America/Sao_Paulo`: 27 testes de matrícula passam. Revisor repetiu matrícula + HTTP administrativo + cliente em UTC: 56/56.
- Navegador detectou documento de 462 px em viewport 390 na tabela de alunos. Restaurar `relative` no scroller reduziu para 390, preservando rótulo acessível. Repetição das quatro rotas em três larguras passou.

## Validação final

- `npm.cmd test`: **217/217**, zero falhas, cancelamentos ou ignorados. Inclui regras puras, mock legado, transporte, sessão, comandos e HTTP real. Sem percentual de cobertura global configurado ou inferido.
- `npm.cmd run typecheck`: saída 0.
- `npm.cmd run check:architecture`: saída 0, 161 módulos, fronteiras preservadas e nenhum ciclo estático.
- `npm.cmd run build`: **Turbopack padrão aprovado**, 24 páginas estáticas com API desligada. Sem fallback Webpack.
- OpenAPI: 79 caminhos válidos; 858 exemplos sem erros. Preview administrativo, leitura de matrícula por ID, filtros e resumo autorizado explicitados. Reativação de usuário da proposta preliminar retirada por extrapolar o backlog; reabertura de turma e efetivação de matrícula preservadas.
- `graphify update .`: atualizado, artefatos locais ignorados. `git diff --check`: sem erros.
- API real, duas sessões independentes, recarga, falhas e layout: [validation-AJA-06-browser.md](validation-AJA-06-browser.md).

## Revisão e limites

Achados confirmados de query desconhecida, projeções de registros/pais retirados, instante único de transação, conflito de idempotência e fuso civil receberam correções/regressões. Histórico legado não inventa ingresso: contextos comprovados e marcações já registradas anteriores à saída conhecida autorizam consulta, sem elegibilidade futura após reabertura. Filtros antecedem paginação e total no servidor.

Repetição estática aprovada: diretório, alteração de código da turma com HTTP 200 persistida após recarga, tabela de alunos e detalhe por query string com histórico após recarga. Revisão independente final: **APPROVE**, zero achados pendentes em todas as severidades; diff completo desde a base, novos arquivos e evidências conferidos. JSON Server local, transações serializadas em um processo e caixa local de links fictícios; não representa backend de produção. Próximos domínios permanecem indisponíveis até sua migração.
