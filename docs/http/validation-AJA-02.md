# Validação AJA-02

Revisão inicial: `e1bade7`. Escopo: processo JSON Server separado, persistência reproduzível, scripts portáveis e allowlist fechada. Entradas: `server/`, `scripts/dev-full.mjs`, scripts npm, configuração/documentação e `tests/http-server.test.mjs`. Nenhuma mudança de interface ou regra acadêmica.

## ECC RED/GREEN

- RED antes de produção: `node --test tests/http-server.test.mjs`, exit 1; import de `server/repository.mjs` falhou `ERR_MODULE_NOT_FOUND`. Testes já escritos: inicialização/reabertura/reset e preservação, rejeição de corrupção, processo HTTP real/allowlist/CORS/reinício. O arquivo de teste permaneceu na árvore.
- Primeiro GREEN ainda falhou legitimamente: 3 testes recusados pelo JSON Server, `Type of "version" (number) is not supported`. Corrigido seed para objeto `meta.schemaVersion`, preservando a informação e compatibilidade da API 0.17.4.
- GREEN: `node --test tests/http-server.test.mjs`, **6/6 passam**, zero falhas/skips. Inclui configuração inválida, reset fora da raiz, junção Windows, preflight, caminhos alternativos e origem vedada. Processo real em porta 0, temporários independentes, persistência por repositório interno, restart e reset sem endpoint probe.
- Revisão: regressão de parâmetro desconhecido em saúde, RED do mesmo comando: `200 !== 422` na linha de `?unknown=1`. Corrigido para rejeitar query não declarada com 422; GREEN 6/6 novamente.

## Verificações

- Manifesto/lock: `json-server` exato 0.17.4, README instalado consultado, router não montado em HTTP.
- `npm install --save-dev --save-exact json-server@0.17.4`: concluído. `npm audit --json`: um pacote com alerta crítico, **Next preexistente**, nenhum alerta atribuído ao JSON Server ou suas dependências. Não foi feito upgrade incidental do framework.
- `npm test`: 137/137 passam, zero falhas/skips. Coordenador confirmou `typecheck` e `check:architecture` PASS; build padrão Turbopack PASS (24 páginas) com API na porta 3002 desligada. Sem fallback Webpack, pois o padrão passou. Instalação limpa, smoke dos scripts e revisão independente ainda em andamento; esta anotação não fecha a issue.
- Build padrão/fallback devem ser reportados separadamente. O frontend permanece independente da API durante o build.

Sem medição de cobertura percentual. Esta suíte verifica infraestrutura, sem alegar cobertura de sessão, permissões acadêmicas, transações concorrentes ou UI ainda não migradas. Teste de Linux não executado nesta máquina Windows; scripts usam Node sem sintaxe específica de shell.

## Verificação independente do coordenador

- Worktree destacado em `tmp/aja02-clean-checkout`, base `e1bade7`, com sobreposição dos arquivos candidatos desta issue e sem `node_modules` anterior: `npm.cmd ci --prefix tmp/aja02-clean-checkout` concluiu saída 0, 164 pacotes instalados. Não se trata ainda de um commit final; é a reprodução isolada do candidato.
- Dentro dessa cópia, `npm.cmd test`: **137/137**, zero falhas, cancelados ou ignorados.
- Na árvore principal: `npm.cmd run typecheck` e `npm.cmd run check:architecture` saída 0 (152 módulos, nenhum ciclo). `npm.cmd run build` saída 0, Turbopack, 24 páginas estáticas em 1121 ms; API padrão indisponível na porta 3002 ao conferir. Não houve fallback nesta issue.
- `npm.cmd run dev:full` na cópia isolada iniciou API em 3002 e Next em 3000. Requisições reais: saúde 200, `/db` 404, saúde com `?unknown=1` 422 e `/login` do Next 200. Ctrl+C encerrou os dois serviços; ambas as portas ficaram indisponíveis. O wrapper npm do Windows pediu confirmação de encerramento do lote, respondida no terminal; esse encerramento solicitado terminou com código 1, sem indicar falha de inicialização ou das requisições.
- Com serviços parados, `npm.cmd run api:reset` na cópia isolada: saída 0, base reinicializada. Testes já verificaram registro persistido por módulo interno, reinício de processo real, releitura e reset preservando arquivo não relacionado.
- `graphify update .`: saída 0 informada pelo implementador, 706 nós/2672 arestas. Artefatos continuam ignorados.

Revisão independente final `review_aja01`: **APPROVE**, zero achados pendentes. Inspeção de todo o diff desde `e1bade7`, incluindo arquivos novos, lock e documentação; reexecução própria de 6/6 testes HTTP/repositório e `git diff --check`. Nenhum achado foi descartado. AJA-02 concluída com os limites acima; implementação aprovada para commit `feat(api): iniciar JSON Server com persistencia isolada`, footer `Refs: AJA-02`.
