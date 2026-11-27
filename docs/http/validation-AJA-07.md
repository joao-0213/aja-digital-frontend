# AJA-07 — disciplinas HTTP (concluída)

Base inicial `a7d5ca4`. Entradas: `/disciplinas?turma=…`, `/disciplinas/detalhes?id=…&aba=…`, cards, equipe, módulos e visitas por usuário. Dependência AJA-06 concluída/revisada. Aplicados ECC TDD/verification, arquiteto-nextjs, docs instalados de Server/Client Components e static export, e consulta Graphify antes de fontes.

## Critérios e fronteiras

- Administração cria/edita disciplina e equipe, revalidando docentes ativos e preservando seleções indisponíveis na composição até remoção explícita.
- Docentes atribuídos têm mesmas permissões de módulos; revogar durante edição impede gravação. Reordenação atômica verifica revisões e preserva conjunto.
- Aluno consulta apenas disciplinas da turma ativa; encerramento e desatribuição revalidam acesso direto.
- Lista, detalhe, filtros, cards, abas, âncoras e novidades usam HTTP. Visitas persistem por conta, em navegadores distintos, sem marcar outra conta ou publicações não observadas.
- Rotas permanecem composições estáticas/Suspense. Materiais, atividades e mural de issues posteriores não montam transporte legado; projeções de integração serão explicitadas sem respostas privadas.

## Plano de prova

Regressões HTTP e cliente em RED antes da implementação; registrar nomes/comandos/falhas nas notas por frente. Após GREEN: suíte completa, tipos, arquitetura e build padrão (fallback separado se necessário), OpenAPI/exemplos, Graphify, navegador em sessões independentes, recarga/falha, teclado/responsividade, revisão independente do diff completo desde a base. Plano executado; resultados e revisão estão registrados abaixo.

## Checkpoints iniciais

- Cliente: `node --experimental-strip-types --test tests/subjects-client.test.ts` RED, saída 1 por ausência de `subjects/api.ts` antes da produção.
- Servidor: `node --experimental-strip-types --test tests/http-subjects.test.mjs` RED, sete testes falharam antes da implementação (404 em operações ausentes, DTO de visitas/detalhe ausente). Nomes e observações completos constam na nota do servidor.
- Root registrou os dois arquivos na lista explícita de `npm test`. OpenAPI candidato 1.0.3: 77 caminhos estruturalmente válidos, 848 exemplos sem erros. Novos DTOs para summary/detail, GET de módulo por ID e visita com IDs observados; propostas extras de retirada de disciplina/módulo removidas. A validação documental não representa GREEN do runtime.

## Validação consolidada

- `npm.cmd test`: **228/228**, zero falhas, cancelamentos ou ignorados. Oito testes HTTP de disciplinas, três de cliente e toda a suíte anterior. Node cobre regras e HTTP real; não substitui DOM/React. Cobertura focada do adaptador de disciplinas: 87,5% de linhas, sem extrapolar para cobertura global.
- `npm.cmd run typecheck`: saída 0. `npm.cmd run check:architecture`: saída 0, 165 módulos, fronteiras preservadas e nenhum ciclo estático.
- `npm.cmd run build`: Turbopack padrão aprovado, 24 páginas exportadas com API desligada. Nenhum fallback Webpack necessário.
- OpenAPI: 77 caminhos estruturalmente válidos, 848 exemplos sem erros. `git diff --check` aprovado; Graphify atualizado localmente, sem artefatos versionados.
- Navegador com API real: criação/edição/reordenação, duas sessões docentes com 409 e conferência, revogação com 403, equipe indisponível, visitas em duas sessões da mesma conta e isolamento da outra, recarga/falha/repetição, 390/768/1440 e teclado. Roteiro completo e limites em [validation-AJA-07-browser.md](validation-AJA-07-browser.md).
- Prévia estática em 3001: filtro por turma, detalhe por query string/aba, PATCH de módulo 200 persistido após recarga e alternância de abas; zero pageerror nesse roteiro.

## Revisão

Correções durante revisão: replay de resposta paginada precisava do contexto interno do alvo para reprojetar apenas estado autorizado (RED HTTP 500, GREEN com replay); query sort indevida no comando de reordenação recebeu RED 200 versus 422 e agora é rejeitada. Permanece paginação explicitamente declarada na resposta do comando, sem truncar o conjunto usado para a transação ou detalhe. O revisor independente confirmou 24/24 focados e não apontou outro defeito técnico; parecer final **APPROVE**, zero achados pendentes em todas as severidades, após conferir o diff completo, contratos e evidências.

Notas específicas: [servidor](validation-AJA-07-server.md) e [cliente](validation-AJA-07-client.md). Limites: processo JSON Server local, sem backend de produção; Edge em workstation, sem aparelhos físicos ou leitor de tela integral. Materiais, atividades, mural e demais domínios posteriores continuam explicitamente indisponíveis até sua issue. Os IDs/counts de projeção não expõem corpos, arquivos, gabaritos ou dados privados.
