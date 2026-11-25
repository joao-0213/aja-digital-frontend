# Validação INT-05 — integração com o gateway

## Escopo e resultado

- `npm run dev` usa o cliente HTTP existente e a URL integrada padrão `http://127.0.0.1:3002/api/v1`. `npm run dev:full` permanece como alias sem iniciar o mock; `npm run dev:mock` inicia o JSON Server explicitamente na porta 3102.
- `.env.example`, documentação de desenvolvimento e operação distinguem gateway e mock. O preview estático continua em 3001.
- O OpenAPI do frontend e o do backend permaneceram idênticos. A lista de CORS de exemplo mantém suas origens existentes e inclui `localhost`/`127.0.0.1` nas portas 3001 do preview.
- A integração encontrou `GET /me/enrollments` retornando 403 para administrador/docente apesar de OpenAPI e matriz permitirem os três papéis. Core agora limita a leitura à identidade da sessão e aceita atores ativos e confirmados de todos os papéis documentados.

## Evidência

- `node --test tests/dev-entrypoints.test.mjs tests/http-server.test.mjs`: 9/9 aprovados antes do ajuste final; `node --test tests/dev-entrypoints.test.mjs`: 3/3 aprovados após ele. A regressão do launcher foi executada com `NEXT_PUBLIC_API_URL=http://127.0.0.1:3002/api/v1` herdada: a versão anterior falhou ao encaminhar `:3002` para Next; a versão corrigida fixa o endpoint local do mock em `:3102`.
- `npm.cmd test`: 367/367 aprovados após tornar determinístico um teste existente que usava o prazo de atividades de 2 de novembro de 2026 junto ao relógio real de 25 de novembro. A mudança fixa apenas a operação de teste ao relógio de fixture já declarado.
- `npm.cmd run typecheck`: aprovado. `npm.cmd run check:architecture`: aprovado, 181 módulos. `npm.cmd run build`: aprovado pelo Turbopack padrão, 24 rotas estáticas. `npm.cmd run check:export`: aprovado, 151 arquivos verificados.
- `services/core`: o teste focado `gradlew.bat test --tests br.com.ajadigital.core.academic.AcademicApplicationUseCaseTests` passou após RED reproduzido para admin/docente/aluno. `gradlew.bat build -x test` passou. A suíte ampla reportou 202 testes, 201 aprovados e 1 falha preexistente em `AssessmentIntegrationTests.kt:231`: o teste alterado previamente omite Origin e recebe `403 FORBIDDEN / Origin is not allowed` ao esperar 200. O teste não foi alterado nesta issue.
- Stack Compose isolado `aja-int05-check`, gateway padrão na porta 3002 e seed fictício: API de sessão, `/me`, `/me/enrollments` e `/subjects` responderam 200 para admin, docente e aluno; questões, atividades e materiais responderam 200 para aluno; gravação de frequência por aluno respondeu 403; docente consultou elegíveis e criou/releu chamada (200/201/200); upload/download PDF round-trip respondeu 201/200. `docs/http/evidence/INT-05/api-flow.mjs` reproduz essas chamadas usando `AJA_DEMO_PASSWORD` do ambiente.
- Preflight real de login com origem `http://127.0.0.1:3001`: 204, `Access-Control-Allow-Origin` explícito e `Access-Control-Allow-Credentials: true`.
- Browser Playwright CLI na exportação real de `npm run build` servida por `npm run preview` em 3001: admin entrou e recarregou perfil sem erro de vínculos; aluno viu seu vínculo, abriu banco de questões e conferiu resolução; docente carregou, salvou e recarregou frequência com uma presença e uma ausência; logout levou ao login e URL protegida redirecionou ao login. Um 503 controlado em `/questions` exibiu erro e retry, que restaurou as questões reais.
- Após o rebuild final, `playwright-cli run-code --filename docs/http/evidence/INT-05/browser-smoke.js` passou asserções DOM de título, heading, campos e botão na página de login. O script não autentica, não registra valores de campos e não lê cookies; resultado sanitizado está em `docs/http/evidence/INT-05/browser-smoke-results.md`.

## Limites observados

- A porta 3000 estava livre. Um processo Next desta mesma cópia já mantinha o lock de desenvolvimento associado à porta 33004; ele foi preservado. O browser foi exercitado no preview padrão 3001. O `npm run dev` foi verificado pelo contrato do script e pelo teste de configuração, mas não foi iniciado em uma segunda instância usando esse diretório enquanto o lock permanecia ativo.
- A suíte Core inteira permanece vermelha pelo teste preexistente descrito acima; a regressão desta issue e o build sem repetir essa falha passaram.
