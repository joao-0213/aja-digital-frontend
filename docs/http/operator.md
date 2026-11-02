# Operação local da API

Requer Node.js 22.6+ e npm. No PowerShell use `npm.cmd` quando a política bloquear `npm`. Instale com `npm ci`. `json-server` está fixado em **0.17.4** no manifesto e lockfile, usando sua API de módulo: `create()` para o app Express e `router(caminhoAbsoluto).db` para persistência. Referência: [README da versão 0.17.4, seção Module](https://github.com/typicode/json-server/tree/v0.17.4#module), também disponível em `node_modules/json-server/README.md`.

## Executar

- `npm run api`: API em `http://127.0.0.1:3002`.
- `npm run dev`: Next em `http://127.0.0.1:3000`.
- `npm run dev:full`: inicia API e Next, encerrando o outro processo se um terminar. Interrompa com Ctrl+C.
- `npm run build` seguido de `npm run preview`: exportação em `out/`, prévia estática na porta 3001. O build funciona com a API desligada.
- `curl.exe http://127.0.0.1:3002/api/v1/health` no Windows; `curl http://127.0.0.1:3002/api/v1/health` no Linux. Resposta 200: `{"status":"ok","version":"1"}`.

Desde AJA-05, além de saúde, estão disponíveis cadastro/login/logout/sessão, confirmação de e-mail, recuperação, consulta/alteração do próprio nome e consulta de vínculos próprios. Os demais endpoints do OpenAPI permanecem alvos das próximas issues. Não há endpoint de probe, reset, manutenção, credenciais, caixa de mensagens ou coleção bruta. Não montamos o router CRUD nem `defaults()` (que habilitaria arquivos estáticos/CORS genérico).

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

Origem inclui esquema, host e porta: `localhost` difere de `127.0.0.1`. Não usar `*`, caminhos ou credenciais nas origens. Requisições com Origin não permitido recebem 403 sem cabeçalho de autorização CORS; requisições de terminal sem Origin podem consultar saúde. Escritas, inclusive login/cadastro/recuperação, exigem Origin permitido. O serviço escuta somente loopback. Cookies são HttpOnly, Path `/api/v1`, SameSite=Lax; o navegador envia com `credentials: include`. Use o mesmo hostname nas portas 3000/3001/3002. `API_FRONTEND_ORIGIN` escolhe uma das origens permitidas para links da caixa local (padrão primeira origem). `API_COOKIE_SECURE=true` ativa Secure; origens HTTPS também o ativam automaticamente. Hospedagem em sites diferentes requer política de cookies própria e aceite AJA-18; a configuração local não promete esse cenário.

## Persistência e reset explícito

O serviço gera `server/runtime/db.json` **somente se ausente**, usando `server/seed.mjs` e a versão em `server/seed.json`. A data-base é o dia corrente de Brasília na inicialização/reset. Prazos são relativos a essa data e ficam persistidos; reiniciar não muda prazos nem alterações. Reabrir preserva a base existente, inclusive uma instalação antiga AJA-02 contendo só metadados: para receber a nova massa, faça backup e reset explícito. JSON corrompido interrompe inicialização sem sobrescrever a base. A pasta runtime não entra no Git nem em `out/`.

Pare a API antes de `npm run api:reset`. O comando não aceita caminhos nem argumentos, ignora overrides de runtime e só recompõe `db.json` na pasta de execução fixa do projeto. Usa substituição por rename; preserva arquivos não relacionados. Links simbólicos/junções na pasta são recusados. Faça backup externo de `db.json` antes do reset se precisar conservar registros; o reset é deliberado e não tem desfazer. Não executar reset simultaneamente com a API.

`node --test tests/http-server.test.mjs` usa diretórios temporários e porta efêmera, sem tocar no runtime do operador. A prova de persistência grava um registro **pelo módulo interno do repositório**, reinicia um processo real da API e relê o arquivo; não existe escrita HTTP pública de teste. `AJA_TEST_RUNTIME` exige `NODE_ENV=test` e muda somente localização dos arquivos, nunca habilita rotas ou acesso. O reset de teste fornece explicitamente sua raiz permitida ao módulo; a CLI de produção não recebe essa opção.

Limite desta etapa: gravação consistente, concorrência, rollback de falha e idempotência de comandos de negócio são AJA-04. A API de domínio não está implementada; não inferir conclusão das demais issues pela resposta de saúde.

## Contas e jornadas preparadas — AJA-03

Todas as identidades abaixo são fictícias e exclusivas do ambiente local. A senha tem formato **`AjaLocal-<id>-2031!`**: por exemplo, `AjaLocal-teacher-a-2031!`. O e-mail é **`<id>@aja.local.test`**. Verificadores scrypt ficam na coleção privada `credentials` do serviço, separados dos perfis. Os salts são determinísticos somente para reproduzir fixtures locais; nunca reutilizar estas contas, senhas ou política em produção.

| ID | Perfil/cenário |
| --- | --- |
| `admin` | Administração: atribuir equipe e incluir matrícula |
| `teacher-a` | Daniela: docente de `s1`, `s-empty` e histórico `s-closed` |
| `teacher-b` | Bruno: segundo docente de `s1`, para edição concorrente |
| `teacher-unassigned` | Docente sem atribuição: acesso negado a `s1` por ID |
| `student` | Alex: aluno matriculado em `c1`, tentativa aberta e entregue, trabalho aguardando feedback |
| `student-two` | Bia: colega de turma, trabalho com retorno publicado |
| `student-empty` | Caio: conta confirmada sem turma |
| `student-pending` | Dora: e-mail não confirmado e matrícula pendente em `c1` |
| `student-inactive` | Eva: conta inativa, sem sessão permitida |

**Provisionado não significa endpoint disponível.** AJA-03 preparou a massa e AJA-05 disponibilizou identidade/sessão/perfil. Arquivos chegam em AJA-08 e demais jornadas acadêmicas nas respectivas issues. O guia abaixo é o roteiro a executar quando essas integrações estiverem implementadas; não é evidência antecipada de uma jornada acadêmica concluída.

1. Administração entra como `admin`; `c1` já contém Alex/Bia e `s1` já tem Daniela/Bruno. Dora está pendente e não entra na chamada. `c-empty`/`s-empty` dão o contexto vazio. `c-closed`/`s-closed` preservam consulta histórica da equipe, com vínculo de Alex encerrado antes da matrícula atual.
2. Docente `teacher-a` abre `/disciplinas/detalhes?id=s1`. O módulo `m1` contém texto `material-text`, PDF `material-pdf` e vídeo externo `material-video`. Há progresso de Alex concluído no texto e retomada no PDF. O vídeo é recurso externo opcional, não binário hospedado; só carregar por escolha do usuário.
3. Para publicar sem cadastro manual, abrir `/questionarios/criar?id=quiz-draft`: o rascunho contém questão de acervo e questão autoral em snapshot. Publicar e observar em outra sessão como Alex. `quiz-open` tem prazo futuro e `attempt-draft` com uma resposta; `quiz-closed` tem prazo encerrado e `attempt-sent`; `quiz-no-deadline` não tem prazo. Questões `qa1` estão restritas aos snapshots e não aparecem no acervo `q1/q2`.
4. Para a sequência completa docente publica → aluno entrega → docente devolve → aluno consulta sem registros manuais prévios, usar o quiz em rascunho para publicação e `quiz-no-deadline` para entrega nova; o resultado é individual. Para trabalho/retorno textual, a atividade `work1` já está publicada: Alex tem `submission-waiting` entregue com arquivo PDF e rascunho docente privado; Daniela/Bruno conferem e publicam esse retorno, Alex consulta o comprovante. Bia tem `submission-feedback` com nota/comentário já publicados para comparar projeções. Para uma nova entrega de trabalho, criar a partir do construtor como parte da ação de autoria, sem cadastrar turma/conta/módulo.
5. Abrir `topic1`: dúvida de Alex referenciada ao texto, imagem anexada, resposta de Daniela aceita e voto próprio de Alex. `topic-question` referencia `q2`. Conferir leitura/nova resposta em outra sessão. Em turma encerrada `topic-closed`, equipe consulta e marca leitura, sem publicar; Alex recebe acesso negado.
6. Consultar avisos `notice1` (encontro com horário em três dias) e `notice-all-day` (dia inteiro em cinco dias); calendário deriva deles, sem duplicata em `events`. Chamada `lesson1` há dois dias tem Alex presente e Bia ausente. Conferir o histórico e o relatório individual. A massa não contém outbox/token/sessão previamente válidos; estes serão criados pelos fluxos reais.

`server/fixtures/proporcoes.pdf` é um PDF de uma página com conteúdo legível; `grupos.png` é uma imagem 320×160 com dois grupos de dois pontos. A coleção `files` referencia os bytes versionados, finalidade, autoria e recurso pai; AJA-08 implementará download e autorização. O arquivo de imagem do acervo tem finalidade interna `question`, **somente de seed**, fora das finalidades de upload público do OpenAPI. AJA-09 deve projetar essa imagem conforme acesso à questão, sem habilitar upload `question` nem divulgar metadados internos indiscriminadamente. A persistência também conserva campos de anexo legados (`id`, `localFileId`) para reaproveitar regras puras; os DTOs públicos posteriores deverão mapear para `fileId` e os campos autorizados.

Teste com data fixa: `generateSeed({ baseDate: '2031-06-15' })`, `openRepository(pastaIsolada, { baseDate: '2031-06-15' })` ou `resetRepository(pastaIsolada, { allowedRoot: pastaIsolada, baseDate: '2031-06-15' })` no módulo interno, nunca uma rota pública. A CLI de reset permanece sem parâmetros. Dois resets com a mesma data produzem os mesmos cenários e verificadores; reinício conserva a data inicial. Não há relógio fixo no processo da API: o gerador só determina datas dos registros iniciais.

## Confirmação e recuperação pelo operador

1. Abra `/cadastro`, cadastre uma conta ou solicite nova confirmação. O cadastro não inicia sessão; o servidor prepara uma mensagem na caixa de saída local.
2. Em outro terminal, execute `npm run api:outbox` (equivalente: `node server/outbox.mjs`). Escolha a mensagem mais recente da conta/finalidade. A CLI imprime destinatário fictício e link com token; não há envio de e-mail externo nem endpoint HTTP para consultar essa caixa. Trate esses links como credenciais temporárias, mesmo neste ambiente fictício.
3. Abra o link `/cadastro?token=…` na origem configurada. Confirme e entre separadamente. Se havia uma única pendência válida, a confirmação efetiva o vínculo usando a mesma regra de matrícula do produto. Conflitos ou turma inativa preservam conta/token para regularização; pendências canceladas não são restauradas.
4. Em `/recuperar-senha`, solicite instruções e repita a consulta da caixa local. A resposta pública é igual para e-mail conhecido ou desconhecido. O link `/recuperar-senha?token=…` permite escolher nova senha. Um reset bem-sucedido encerra todas as sessões da conta; entre com a senha nova.

Tokens expiram em 30 minutos, são de uso único e uma nova solicitação invalida os links anteriores da mesma finalidade. Uma alteração do e-mail da conta também invalida o token emitido para o endereço antigo. Sessões expiram em oito horas e logout invalida apenas a sessão corrente. Login incorreto encerra a sessão que estava nesse navegador para evitar reabrir a identidade anterior por recarga. No serviço somente hashes de tokens/sessões e verificadores scrypt são persistidos; a caixa local privada conserva links para a operação manual autorizada.

O script de API usa `--experimental-strip-types` para Node 22.6+, pois reutiliza as regras TypeScript de matrícula sem transportar o seed para o frontend. Não iniciar `server/index.mjs` em Node 22.6 sem essa opção. A CLI de outbox não aceita caminhos/argumentos e não depende de TypeScript; consulta somente a pasta de execução fixa do projeto.
