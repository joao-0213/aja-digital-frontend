# Validação AJA-03

Revisão inicial `88b40db`. Escopo: cenários privados versionados, gerador relativo ao dia de inicialização em Brasília, fixtures binárias, integração do repositório e guia do operador. Nenhum endpoint de domínio ou código frontend foi alterado. `server/seed.json` conserva versão em objeto compatível JSON Server, `server/seed.mjs` gera as relações e verificadores privados somente na inicialização/reset.

## ECC RED/GREEN

- RED antes de produção: `node --experimental-strip-types --test tests/server-seed.test.mjs`, exit 1, `ERR_MODULE_NOT_FOUND` de `server/seed.mjs`. O teste já cobria relações de jornadas, regras puras de acesso/composição, snapshots, bytes e persistência em reset/reabertura.
- GREEN: mesmo comando, **4/4 PASS**, zero falhas/skips. A suíte foi ampliada para conferir todas as referências de usuários/turmas/disciplinas/módulos, matrícula/e-mail/cronologia, elegibilidade na chamada, avisos/acontecimento, progresso, snapshots/gabaritos, questão autoral isolada, fórum/anexos/votos/leitura/solução única e arquivos/pai/finalidade/autoria. Verifica senha do guia contra scrypt real, não apenas comprimento do hash.
- Reset fixo duplo produz estado idêntico; reabertura com outra data mantém prazos e alteração anterior; dia corrente é calculado em Brasília. Casos adicionais: virada de ano, 29/02 bissexto e 29/02 inválido, além de data civil inexistente.
- Revisão independente identificou metadados anteriores à criação de materiais. Regressão adicionada: RED no mesmo comando, `materials/material-text: updatedAt before 2031-06-08T12:00:00-03:00`. Gerador corrigido para derivar última alteração dos eventos do registro e autoria pertinente; GREEN 4/4 novamente. Matrícula histórica encerrada foi posicionada antes do ingresso na turma atual.
- `npm test`: **141/141 PASS**, zero falhas/skips, incluindo a suíte HTTP real anterior (processo/restart/allowlist/corrupção/reset). Sem limiar percentual de cobertura configurado.

## Binários e limites de evidência

PDF criado com ReportLab e parseado com pypdf: uma página, extração de texto válida (inclusive acentos e exemplo 4/2). A primeira tentativa de acentuação via pipeline PowerShell corrompeu caracteres; corrigida com escapes Unicode no script Python. Coordenador confirmou no arquivo final abertura/renderização PyMuPDF, texto Unicode correto sem `?` literal e inspeção visual sem cortes/sobreposições. PNG criado com Pillow, decodificado 320×160 e inspecionado pelo coordenador. Os arquivos estão em `server/fixtures/`, fora de `public/` e sem import no grafo do cliente. Headers HTTP/download e permissões reais de arquivo serão validados em AJA-08.

Skill PDF consultada; helper de marcação encontrado no pacote `skills/pdf/container_tools` e executado com sucesso. Ferramentas Python de autoria/inspeção foram instaladas somente no ambiente local, sem dependências Python de execução do produto.

Coordenador executou typecheck PASS, arquitetura PASS (152 módulos) e build padrão Turbopack PASS (24 páginas, 967 ms). Busca em `out/` por `AjaLocal-`, `aja-local-fixture` e e-mail da conta pendente não encontrou ocorrências. Nenhum fallback Webpack necessário. Revisão independente final ainda em andamento. As contas são provisionadas; login e jornadas interativas ainda aguardam AJA-05 em diante. Não foram alegados sucesso de UI, autorização HTTP de domínio, envio externo de e-mail, sessão válida ou cobertura de concorrência nesta etapa.

## Aceite final

Commit principal: `d51327e`. Na checagem do índice, o Git inicialmente classificou o PDF como texto e `git diff --cached --check` apontou espaços obrigatórios/gerados no formato PDF. O comando de commit foi executado na mesma sequência PowerShell e prosseguiu; esse resultado não foi um PASS de whitespace. Os bytes foram preservados, pois remover espaços pode invalidar offsets do PDF. Correção subsequente: `.gitattributes` declara `*.pdf binary`; revisão e nova checagem registradas abaixo.

A revisão da correção detectou a substituição acidental da linha global de normalização. A versão final preserva `* text=auto eol=lf` e acrescenta a regra PDF depois dela. `git diff --check` e a checagem do commit principal com os atributos corrigidos retornaram saída 0; nenhum byte de fixture foi alterado.

Revisão complementar `review_aja01`: **APPROVE**, sem achados pendentes, confirmando preservação da regra LF e dos bytes do PDF. Sem nova suíte comportamental, pois a correção só declara atributos Git e registra a evidência.

Revisão independente `review_aja01`: **APPROVE**, zero achados pendentes. O revisor inspecionou todo o diff desde `88b40db` e executou seed+servidor 10/10, além de `git diff --check`. Correções de cronologia e metadados conferidas; nenhum achado descartado. Coordenador reexecutou `npm.cmd test` após as correções: **141/141**, zero falhas, cancelados ou ignorados. Graphify atualizado localmente pelo implementador (716 nós/2704 arestas), sem artefatos no commit. AJA-03 concluída, respeitados os limites de infraestrutura e jornadas futuras descritos acima.
