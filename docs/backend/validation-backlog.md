# Validação documental do backlog backend

> **Registro histórico de validação documental (revisão `516b820`, pré-INT-05).** Menções a issues ainda não implementadas e a `ISSUES-FRONTEND-HTTP.md` (posteriormente encerrado e removido junto com `ISSUES-BACKEND.md`) preservam o estado da revisão original. Para a operação vigente com gateway padrão em `http://127.0.0.1:3002/api/v1`, consulte [README.md](../../README.md), [operator.md](../http/operator.md) e [validation-INT-05.md](../http/validation-INT-05.md).

**Estado:** documento e backlog propostos; nenhuma issue de implementação está concluída. Revisão de partida `516b820ef0324e3693cdf1c305f660153671aeec`.

## Verificações feitas

- Lidos `AGENTS.md`, `ARQUITETURA.md`, `ISSUES-FRONTEND-HTTP.md`, `docs/http/openapi.json`, `docs/http/route-matrix.md`, `docs/http/contract.md`, `docs/http/operator.md` e os guias ECC `tdd-workflow`, `verification-loop` e `code-reviewer` instalados em `ecc/2.2.3`.
- `docs/http/openapi.json` identificado como OpenAPI 3.1, versão 1.0.8. A matriz de ownership lista 98 pares path+method; conferência independente no decorrer da revisão encontrou 98/98, sem operações ausentes, extras ou duplicadas.
- Links Markdown internos nos dois documentos do backlog conferidos. Os schemas apontados existem no OpenAPI; o arquivo OpenAPI continua a fonte de parâmetros e shape exato para evitar cópia divergente.
- Suites existentes foram localizadas por domínio para servir como referência comportamental, incluindo `tests/http-auth.test.mjs`, `tests/http-administration.test.mjs`, `tests/http-questions.test.mjs`, `tests/http-assessments.test.mjs`, `tests/http-attempts.test.mjs`, `tests/http-submissions.test.mjs`, `tests/http-materials.test.mjs`, `tests/http-forum.test.mjs`, `tests/http-attendance.test.mjs`, `tests/http-announcements.test.mjs`, `tests/http-dashboard.test.mjs`, `tests/http-consistency.test.mjs` e `tests/http-real-process-contract.test.mjs`. São testes do frontend/JSON Server, não validação do backend futuro.
- A regra Graphify foi aplicada antes da navegação em fontes de código; `graphify-out/` não foi alterado deliberadamente nem adicionado ao Git.

## O que não foi executado

Este é um trabalho somente documental e não há projetos Kotlin/Spring Boot implementados neste repositório. Não foram executados RED/GREEN, APIs backend, PostgreSQL/RabbitMQ, gates Kotlin/Gradle, teste de navegador ou build frontend. Os gates `npm test`, `npm run typecheck`, `npm run check:architecture` e `npm run build` validam o frontend atual e não provam o backlog/backend; por isso não foram usados como aceite. B-01 deve definir comandos reais de build/test/arquitetura Kotlin, e cada issue futura registra sua execução e limitações.

## Estado das revisões e entrega

O backlog mantém todas as issues B-01 a B-16 abertas. Revisão ECC independente: **APPROVE**, zero achados pendentes após rechecagem do diff final. Revisão Ponytail independente: **Ship**, sem achados acionáveis. Esta nota registra escopo e verificações de documentação; não fecha issue futura nem substitui seus testes, gates, aceites HTTP ou revisão de código.
