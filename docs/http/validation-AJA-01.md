# AJA-01 — evidências de execução

Estado: concluída e aprovada na revisão independente. O histórico abaixo preserva os resultados intermediários, inclusive falhas posteriormente corrigidas.

- Revisão inicial: `e169df6`; árvore limpa; branch dedicada `feat/frontend-http`.
- Escopo: contrato OpenAPI versionado, matriz das 22 rotas e ações secundárias, inventário de coleções/armazenamento e regras de transição. Entradas: `ARQUITETURA.md`, índice do backlog, modelos, contexto, regras de acesso/mutações e testes existentes.
- Orientação: ECC `tdd-workflow`, `verification-loop`, `code-reviewer` instalados em `~/.codex/plugins/cache/ecc/ecc/2.2.3/`; skill local `arquiteto-nextjs`; guias instalados do Next.js `01-app/02-guides/static-exports.md` e `01-app/01-getting-started/05-server-and-client-components.md`.
- Graphify consultado antes de navegação de código. Artefatos do grafo permanecem locais.
- TDD RED/GREEN: não aplicável nesta issue documental; nenhuma regra executável foi alterada. Contratos definem o alvo, não comprovam implementação de endpoints. As issues seguintes precisam de regressões executadas antes da implementação.

## Verificações já executadas

Em 2026-11-02, Node `v24.20.0`, npm e runner `node:test` do projeto:

| Comando | Resultado observado |
| --- | --- |
| `npm.cmd test` | 131 testes, 131 passaram, zero falhas/cancelados/ignorados |
| `npm.cmd run typecheck` | saída 0; geração de rotas e TypeScript aprovados |
| `npm.cmd run check:architecture` | saída 0; 152 módulos, fronteiras preservadas, nenhum ciclo estático |
| `npm.cmd run build` | saída 1; Turbopack falhou ao criar processo de transformação de `src/app/globals.css`: processo Node encerrou antes da conexão, código 0 |
| `npm.cmd run build -- --webpack` | saída 0; compilação, TypeScript e exportação estática concluídos; 24 páginas geradas incluindo estados internos |
| `git diff --check` | saída 0 |

Limites: testes atuais validam o legado, não a futura API HTTP. Sem medição de cobertura nesta issue documental. Não há mudança de UI nem endpoint disponível a exercitar. Revisão independente do diff completo e validação semântica do OpenAPI/matriz ainda pendentes. O build padrão não está validado; registrar o fallback separadamente não o transforma em sucesso.

## Revisão e contrato — em andamento

Revisor independente `review_aja01` (somente leitura) acionado para todo o diff desde `e169df6`, incluindo arquivos novos. Achados preliminares em resolução: alinhar endpoint de visitas (corrigido no inventário); corrigir acentos literais corrompidos no JSON; representar ordem mista de questões do acervo e autorais na criação/edição. O parecer final ainda não foi emitido.

Validador `openapi-spec-validator 0.9.0` instalado somente no ambiente local ignorado `tmp/http-contract-venv`, sem alterar dependências do produto. Primeiro comando `tmp/http-contract-venv/Scripts/python.exe -c "import json; from openapi_spec_validator import validate_spec; validate_spec(json.load(open('docs/http/openapi.json',encoding='utf-8')))"` falhou com `DuplicateOperationIDError: listEnrollment` em `GET /enrollments`. Correção e nova execução pendentes. Essa evidência é validação documental, não teste de endpoint nem RED de comportamento implementado.

O build Turbopack foi repetido e reproduziu a mesma falha de processo CSS. Não houve alteração de código executável para contorná-la. Nenhuma issue foi fechada nem commit criado antes do parecer e das verificações finais.

Na retomada, `git status` confirmou somente as mudanças documentais desta issue na branch dedicada, ainda sobre `e169df6`. Nova execução do validador reproduziu o ID duplicado. O build padrão também falhou com PTY habilitado, descartando a ausência de terminal como solução simples; diagnóstico delegado sem alterar dependências ou o comando padrão.

O achado da composição de questões tem cenário específico: a seleção `[questão do acervo 1, autoral nova, questão do acervo 2]` não cabe em `questionIds` separado de `originals` sem referência/ordem comum. A correção precisa representar essa ordem no DTO de criação e de edição, com chaves que permitam referenciar a questão autoral ainda sem ID do servidor. A aprovação depende da conferência final do revisor após essa alteração.

## Resultado posterior do build e exemplos

O diagnóstico independente lançou o worker PostCSS por Node e observou conexão TCP bem-sucedida. Uma execução de `npm.cmd run build` com `NODE_DEBUG=net` temporário passou (log local ignorado `output/build-net-diagnostic.log`). Depois, a execução padrão **sem NODE_DEBUG**, sessão `81382`, terminou com **saída 0**, compilação em 1674 ms e 24 páginas estáticas em 1055 ms. Não houve alteração de configuração, scripts ou dependências. O build padrão tem resultado positivo observado; as falhas anteriores permanecem registradas como intermitentes, sem causa definitiva comprovada.

Foi acrescentada validação local dos exemplos com JSON Schema Draft 2020-12 (`tmp/validate-http-examples.py`, artefato ignorado). Dos 851 exemplos inspecionados na versão intermediária, dois falharam: resposta de questão com `options: []` abaixo do mínimo e exemplo de dashboard com metadados de arquivo nulos incompatíveis com o DTO. Achados encaminhados ao responsável pelo contrato. O revisor também comprovou que progresso próprio no legado aceita aluno/docente/administrador; restringir PATCH a aluno no contrato perderia comportamento existente. Essas correções e a validação final continuam pendentes.

## Validação final das correções

Correções aplicadas: endpoint de visitas alinhado; acentos recuperados (inclusive enum `Manhã`); identificador `listMyEnrollments` exclusivo; progresso próprio aberto aos três perfis conforme regra legada; composição unificada em `AssessmentQuestionEntry`; exemplos de questão/dashboard ajustados. A matriz de aluno detalhado descreve identificação, vínculos e frequência, sem prometer progresso/atividades ausentes nessa tela legada.

- `openapi-spec-validator.validate_spec`: saída 0, **78 caminhos válidos**.
- JSON Schema Draft 2020-12: **851 exemplos de requisição/resposta, zero erros** após correções.
- Exemplo de `POST /assessments` com banco `q1`, autoral nova e banco `q2`: válido no schema de criação e preservado nessa ordem no documento.
- `git diff --check`: saída 0.
- Gates do produto: 131/131 testes, typecheck e arquitetura aprovados; build padrão Turbopack e fallback Webpack aprovados separadamente, conforme resultados anteriores. Mudanças posteriores são exclusivamente documentais.

Limites finais: a validação estrutural e de exemplos não executa os endpoints. O serviço e seus testes reais são entregas seguintes. Não se afirma cobertura percentual, autorização efetiva ou transações HTTP nesta issue. Nenhuma interface ou persistência executável foi alterada; por isso não há RED/GREEN comportamental nem sessão de navegador nesta etapa.

Parecer final `review_aja01`: **APPROVE**, zero achados pendentes em todas as severidades. O revisor inspecionou todo o diff desde `e169df6`, confirmou as correções e executou independentemente validação OpenAPI, 851 exemplos e `git diff --check`. Nenhum achado foi descartado sem correção. Commit identificado pelo assunto `docs(http): fixar contrato e matriz de migracao`, com footer `Refs: AJA-01`.
