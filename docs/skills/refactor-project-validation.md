# Validação da skill local refactor-project

> **Registro histórico (2026-11-02, pré-corte final e integração do gateway).** Referências a `VALIDACAO.md` e `ISSUES-FRONTEND-HTTP.md` abaixo registram a conferência realizada naquela data; para a arquitetura e operação vigentes (`http://127.0.0.1:3002/api/v1` por padrão e mock em `3102`), consulte [README.md](../../README.md), [ARQUITETURA.md](../../ARQUITETURA.md) e [operator.md](../http/operator.md).

Data: 2026-11-02 (America/Sao_Paulo).

## Escopo

Criar instruções locais para auditoria estrutural do projeto inteiro, análise semântica/consolidação de tipos, extração de lógica repetida e divisão por responsabilidade, respeitando a arquitetura e o fluxo do AJA. Nenhum código da aplicação, configuração de transporte ou dado foi alterado nesta tarefa.

Revisão inicial: `c3aa419`. Durante a revisão, outro trabalho no checkout avançou HEAD para `64c9529d2a3ed619fda3db90c23d7c48ce119355`. Alterações HTTP preexistentes/concomitantes foram excluídas desta entrega. A skill é nova; não substitui nem modifica outras skills ou AGENTS.md.

Arquivos entregues: `.agents/skills/refactor-project/SKILL.md`, `agents/openai.yaml` e cinco referências (`analysis.md`, `type-analysis.md`, `report-format.md`, `validation-scenarios.md`, `sources.md`). Como `.agents/` é ignorado pelo projeto, somente esses sete arquivos autorais são adicionados explicitamente ao Git; as regras de ignore e outras skills permanecem intactas.

## Verificações executadas

- `python C:/Users/joaov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/refactor-project`: exit 0, `Skill is valid!`.
- Self-check Python com assertions: sete arquivos, leitura UTF-8, links Markdown relativos existentes, ausência de scaffold, YAML da interface válido, descrição entre 25 e 64 caracteres e descoberta automática mantida. Resultado: PASS.
- O primeiro self-check detectou metadados do inicializador em encoding Windows; foram normalizados para UTF-8. A repetição verificou inclusive os acentos exatos da descrição em português. Não se tratou de RED/GREEN de comportamento da aplicação.
- Conferidos os quatro scripts em package.json e a existência de AGENTS.md, ARQUITETURA.md, VALIDACAO.md, ISSUES-FRONTEND-HTTP.md, docs/http/, arquiteto-nextjs e os guias Next.js instalados.
- Consulta Graphify executada antes da navegação no repositório. `graphify update .` não é necessário para esta entrega exclusivamente documental.

## Revisão independente e forward-testing

Revisor ECC independente `skill_ecc_review`, gpt-6.1-sol / medium, leu todos os arquivos e as instruções/arquitetura locais. Parecer: APPROVE, zero achados. Respondeu aos cenários antes de ler o gabarito da referência de validação:

1. Auditoria somente leitura com staged alheio, untracked e 30 arquivos pendentes: preservar alterações e declarar análise incompleta. Filtros equivalentes exigem verificação semântica; IDs de aluno/docente continuam separados. Paginação anônima não é fundida mecanicamente com operações autenticadas/canceláveis.
2. Extração autorizada com factory de 25 funções: preservar fachada e entradas públicas. Guarda que só verifica existência de id aceita entidade inválida e exige correção funcional autorizada com regressão. Rejeitar fetch autenticado no build e remoção dos índices públicos.
3. Teste focado verde com build/revisão obrigatórios faltantes e revogação conferida em um único contexto: manter issue aberto e registrar evidências faltantes, incluindo sessões independentes.

São testes de interpretação das instruções, não execução de refatoração nem prova empírica de detecção de todos os tipos duplicados. Os demais cenários de validation-scenarios.md foram documentados para futuras avaliações, não declarados executados.

A revisão Ponytail foi dispensada por instrução explícita do usuário nesta entrega: “ponytail é desnecessário. Não é código”. O agente foi orientado a parar; não houve parecer final de aprovação. A dispensa não altera AGENTS.md nem elimina automaticamente revisões exigidas em futuras issues com código.

## Limites e gates dispensados

Não foram executados npm test, typecheck, check:architecture, build ou testes de navegador/API: apenas instruções e metadados da skill foram criados, sem mudança de código executável da aplicação. Aplica-se a exceção documental do AGENTS.md; não se afirma validação da migração HTTP em andamento. Não houve novos scripts ou dependências. Links externos de fundamentação foram consultados durante a pesquisa anterior; não são dependências operacionais da skill.

A skill não garante perfeição nem ausência de defeitos. Sua eficácia em refatorações reais ainda depende de aplicação supervisionada, testes do projeto e evidências por lote; este registro comprova estrutura, compatibilidade documental e os três cenários avaliados.
