# Operação local da API

Requer Node.js 22.6+ e npm. No PowerShell use `npm.cmd` quando a política bloquear `npm`. Instale com `npm ci`. `json-server` está fixado em **0.17.4** no manifesto e lockfile, usando sua API de módulo: `create()` para o app Express e `router(caminhoAbsoluto).db` para persistência. Referência: [README da versão 0.17.4, seção Module](https://github.com/typicode/json-server/tree/v0.17.4#module), também disponível em `node_modules/json-server/README.md`.

## Executar

- `npm run api`: API em `http://127.0.0.1:3002`.
- `npm run dev`: Next em `http://127.0.0.1:3000`.
- `npm run dev:full`: inicia API e Next, encerrando o outro processo se um terminar. Interrompa com Ctrl+C.
- `npm run build` seguido de `npm run preview`: exportação em `out/`, prévia estática na porta 3001. O build funciona com a API desligada.
- `curl.exe http://127.0.0.1:3002/api/v1/health` no Windows; `curl http://127.0.0.1:3002/api/v1/health` no Linux. Resposta 200: `{"status":"ok","version":"1"}`.

Na AJA-02 **somente** GET `/api/v1/health` está disponível. O preflight OPTIONS dessa mesma rota permite GET de origens explícitas. O restante do OpenAPI é o contrato alvo das próximas issues. Não há endpoint de probe, escrita, reset, manutenção, credenciais, caixa de mensagens ou coleção bruta. Não montamos o router CRUD nem `defaults()` (que habilitaria arquivos estáticos/CORS genérico). Até a integração das fatias seguintes, o frontend continua na versão anterior.

## Configuração de origem

`.env.example` lista as variáveis. Next lê `NEXT_PUBLIC_API_URL` durante seu build; não é uma configuração alterável no HTML depois da exportação. A API lê variáveis de ambiente do processo, sem carregar `.env` automaticamente. Exemplo PowerShell:

```powershell
$env:API_PORT='3002'
$env:API_ALLOWED_ORIGINS='http://127.0.0.1:3000,http://127.0.0.1:3001'
npm.cmd run api
```

Linux:

```sh
API_PORT=3002 API_ALLOWED_ORIGINS=http://127.0.0.1:3000,http://127.0.0.1:3001 npm run api
```

Origem inclui esquema, host e porta: `localhost` difere de `127.0.0.1`. Não usar `*`, caminhos ou credenciais nas origens. Requisições com Origin não permitido recebem 403 sem cabeçalho de autorização CORS; requisições de terminal sem Origin podem consultar saúde. O serviço escuta somente loopback. Para a etapa de sessão, cookies HttpOnly e controle de origem serão implementados em AJA-05; esta etapa ainda não estabelece sessão.

## Persistência e reset explícito

O serviço copia `server/seed.json` para `server/runtime/db.json` **somente se ausente**. Reabrir preserva alterações; JSON corrompido interrompe inicialização, sem sobrescrever a base. Na AJA-02 o seed contém somente metadados de versão; contas e jornadas são AJA-03. A pasta runtime não entra no Git nem em `out/`.

Pare a API antes de `npm run api:reset`. O comando não aceita caminhos nem argumentos, ignora overrides de runtime e só recompõe `db.json` na pasta de execução fixa do projeto. Usa substituição por rename; preserva arquivos não relacionados. Links simbólicos/junções na pasta são recusados. Faça backup externo de `db.json` antes do reset se precisar conservar registros; o reset é deliberado e não tem desfazer. Não executar reset simultaneamente com a API.

`node --test tests/http-server.test.mjs` usa diretórios temporários e porta efêmera, sem tocar no runtime do operador. A prova de persistência grava um registro **pelo módulo interno do repositório**, reinicia um processo real da API e relê o arquivo; não existe escrita HTTP pública de teste. `AJA_TEST_RUNTIME` exige `NODE_ENV=test` e muda somente localização dos arquivos, nunca habilita rotas ou acesso. O reset de teste fornece explicitamente sua raiz permitida ao módulo; a CLI de produção não recebe essa opção.

Limite desta etapa: gravação consistente, concorrência, rollback de falha e idempotência de comandos de negócio são AJA-04. A API de domínio não está implementada; não inferir conclusão das demais issues pela resposta de saúde.
