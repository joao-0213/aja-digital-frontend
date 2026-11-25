# Operação local da API

Requer Node.js 22.6+ e npm. No PowerShell use `npm.cmd` quando a política bloquear `npm`. Instale com `npm ci`. `json-server` está fixado em **0.17.4** no manifesto e lockfile, usando sua API de módulo: `create()` para o app Express e `router(caminhoAbsoluto).db` para persistência. Referência: [README da versão 0.17.4, seção Module](https://github.com/typicode/json-server/tree/v0.17.4#module), também disponível em `node_modules/json-server/README.md`.

## Executar

- `npm run dev`: Next em `http://127.0.0.1:3000`, usando por padrão a API integrada em `http://127.0.0.1:3002/api/v1`.
- `npm run dev:full`: alias compatível para `npm run dev`; não inicia uma API local.
- `npm run api`: JSON Server local explícito em `http://127.0.0.1:3102`.
- `npm run dev:mock`: inicia o JSON Server em `3102` e o Next em `3000`, apontando o navegador para a API mock.
- `npm run build` seguido de `npm run preview`: exportação em `out/`, prévia estática na porta 3001. O build funciona com a API desligada.
- `curl.exe http://127.0.0.1:3102/api/v1/health` no Windows; `curl http://127.0.0.1:3102/api/v1/health` no Linux. Resposta 200: `{"status":"ok","version":"1"}`.

As jornadas institucionais de AJA-05 a AJA-17 estão implementadas no serviço separado. O contrato OpenAPI e a [matriz de rotas](route-matrix.md) definem chamadas, respostas e acesso por perfil. Não há endpoint público de reset, credenciais, caixa de mensagens ou coleção bruta. Não montamos o router CRUD nem `defaults()` (que habilitaria arquivos estáticos/CORS genérico).

## Configuração de origem

`.env.example` lista as variáveis. Next lê `NEXT_PUBLIC_API_URL` durante seu build; não é uma configuração alterável no HTML depois da exportação. A API lê variáveis de ambiente do processo, sem carregar `.env` automaticamente. Exemplo PowerShell:

```powershell
$env:API_PORT='3102'
$env:API_ALLOWED_ORIGINS='http://127.0.0.1:3000,http://127.0.0.1:3001'
npm.cmd run api
```

Linux:

```sh
API_PORT=3102 API_ALLOWED_ORIGINS=http://127.0.0.1:3000,http://127.0.0.1:3001 npm run api
```

Origem inclui esquema, host e porta: `localhost` difere de `127.0.0.1`. Não usar `*`, caminhos ou credenciais nas origens. Requisições com Origin não permitido recebem 403 sem cabeçalho de autorização CORS; requisições de terminal sem Origin podem consultar saúde. Escritas, inclusive login/cadastro/recuperação, exigem Origin permitido. O serviço escuta somente loopback. Cookies são HttpOnly, Path `/api/v1`, SameSite=Lax; o navegador envia com `credentials: include`. Use o mesmo hostname nas portas 3000/3001 do frontend e 3002 da API integrada, ou 3102 do JSON Server local. `API_FRONTEND_ORIGIN` escolhe uma das origens permitidas para links da caixa local (padrão primeira origem). `API_COOKIE_SECURE=true` ativa Secure; origens HTTPS também o ativam automaticamente. Hospedagem em sites diferentes requer política de cookies própria e aceite AJA-18; a configuração local não promete esse cenário.

## Exportação estática e origem pública da API

`NEXT_PUBLIC_API_URL` é incorporada aos arquivos JavaScript durante `next build`; configure-a **antes do build**. Ela deve apontar para a URL pública completa da API e incluir `/api/v1`. Não é possível trocar o endereço editando o ambiente do servidor estático depois de exportar. Não coloque senhas, tokens ou chaves nessa variável.

PowerShell, com API local disponível para o preview:

```powershell
$env:API_PORT='3102'
$env:API_ALLOWED_ORIGINS='http://127.0.0.1:3001'
$env:API_FRONTEND_ORIGIN='http://127.0.0.1:3001'
$env:API_COOKIE_SECURE='false'
npm.cmd run api

# Em outro terminal, prepare a URL antes de compilar.
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:3102/api/v1'
npm.cmd run build
npm.cmd run preview
```

Para integração, inicie o Compose do backend com as origens `127.0.0.1:3000` e `127.0.0.1:3001`; o frontend já usa o gateway `127.0.0.1:3002` por padrão. Para a API mock isolada, use `npm run dev:mock`, que seleciona `127.0.0.1:3102`.

Linux/macOS usa as mesmas variáveis como prefixos no comando, por exemplo `NEXT_PUBLIC_API_URL=http://127.0.0.1:3102/api/v1 npm run build`; reinicie o processo de desenvolvimento após mudar o ambiente. Para trocar de API, aponte a URL a outra instância que implemente o mesmo contrato e permita a origem do frontend em `API_ALLOWED_ORIGINS`, então gere um novo build. O teste `tests/http-real-process-contract.test.mjs` demonstra o mesmo conjunto de contratos com duas URLs de processos JSON Server isolados em `npm test`.

Em desenvolvimento e preview locais, use o mesmo hostname em site e API. Portas diferentes ainda formam origens distintas: CORS precisa listar exatamente `http://127.0.0.1:3000` ou `http://127.0.0.1:3001`, conforme o frontend aberto. A API responde com origem explícita e credenciais permitidas; o cliente usa `credentials: include`. A sessão é cookie HttpOnly com `Path=/api/v1`, `SameSite=Lax`; em HTTP local não há `Secure`, em HTTPS ele é obrigatório. Um domínio de frontend/API diferente pode tornar o cookie third-party: `SameSite=Lax` não promete esse cenário. Hospedagem separada requer desenho e validação próprios de `SameSite=None; Secure`, CORS com credenciais e política do navegador antes de publicar.

## Persistência e reset explícito

O serviço gera `server/runtime/db.json` **somente se ausente**, usando `server/seed.mjs` e a versão em `server/seed.json`. A data-base é o dia corrente de Brasília na inicialização/reset. Prazos são relativos a essa data e ficam persistidos; reiniciar não muda prazos nem alterações. Reabrir preserva a base existente, inclusive uma instalação antiga AJA-02 contendo só metadados: para receber a nova massa, faça backup e reset explícito. JSON corrompido interrompe inicialização sem sobrescrever a base. A pasta runtime não entra no Git nem em `out/`.

Pare a API antes de `npm run api:reset`. O comando não aceita caminhos nem argumentos, ignora overrides de runtime e só recompõe `db.json` na pasta de execução fixa do projeto. Usa substituição por rename; preserva arquivos não relacionados. Links simbólicos/junções na pasta são recusados. Faça backup externo de `db.json` antes do reset se precisar conservar registros; o reset é deliberado e não tem desfazer. Não executar reset simultaneamente com a API.

`node --test tests/http-server.test.mjs` usa diretórios temporários e porta efêmera, sem tocar no runtime do operador. A prova de persistência grava um registro **pelo módulo interno do repositório**, reinicia um processo real da API e relê o arquivo; não existe escrita HTTP pública de teste. `AJA_TEST_RUNTIME` exige `NODE_ENV=test` e muda somente localização dos arquivos, nunca habilita rotas ou acesso. O reset de teste fornece explicitamente sua raiz permitida ao módulo; a CLI de produção não recebe essa opção.

`npm test` inclui `tests/http-real-process-contract.test.mjs`, que parte dois servidores reais em portas efêmeras, inicializa massas em diretórios temporários e executa o mesmo contrato de sessão e autorização em ambas as URLs. Os demais testes `http-*.test.mjs` exercitam os serviços e contratos em fixtures isoladas. AJA-18 registra o escopo dessa cobertura e as limitações de cada jornada; o `health` por si só nunca prova disponibilidade das demais operações.

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

## Administração HTTP — AJA-06

Entre como `admin` para criar/editar docentes e turmas, alterar cargos, inativar/retirar contas e gerir matrículas. Um docente criado pela administração recebe os links de definição de senha e confirmação pela caixa local (`npm run api:outbox`); não existe senha preenchida ou retornada pela API. O último administrador ativo é protegido. Inativar/retirar ou mudar o cargo de uma conta encerra suas sessões. Não há restauração de conta pela interface ou endpoint público; reabertura de turma é uma operação separada que não restaura vínculos encerrados.

Ao incluir por e-mail, confira o preview antes de confirmar. A consulta não efetiva matrícula: se outra sessão mudar a turma/conta entre conferência e confirmação, a gravação revalida e pode falhar preservando o preenchimento. E-mail desconhecido vira pendência, sem criar conta. Confirmação e cadastro usam a mesma reserva. Reutilizar o endereço antigo de outra conta não transfere o vínculo existente. Para cancelar/encerrar, use a revisão atual; em conflito consulte e confira o registro antes de tentar novamente.

Encerrar turma cancela as pendências e encerra vínculos, preservando autoria, tentativas, trabalhos e chamadas. Reabrir a turma não restaura participantes. Registros legados sem data confiável exibem ingresso não registrado: a data de criação de uma prova histórica não é a data de ingresso. Docentes atualmente atribuídos podem consultar esse histórico, sem conceder nova participação ao aluno. Matrículas ambíguas de mais de uma turma ativa exigem regularização administrativa explícita.

Listas usam paginação real. `GET /students?classId=c1&history=true` inclui histórico antes da paginação; o padrão é participantes atuais. `GET /enrollments?classId=c1&status=pending,cancelled&q=exemplo` pesquisa as situações pedidas por e-mail/nome autorizado antes do total/página. `GET /enrollments/{id}` é consulta administrativa para conferir a revisão. Professor sem atribuição e aluno não recebem dados administrativos por acessar uma URL diretamente.
