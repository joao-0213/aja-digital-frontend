# AJA-05 — cliente de sessão e entradas autenticadas

Base: `43549c1`. Escopo deste registro: `src/providers/session-client.ts`, `src/providers/app-context.ts`, `src/components/providers.tsx`, shell, autenticação, perfil, aviso de privacidade e `tests/session-client.test.ts`. O agente principal consolida API, navegação real, revisão independente e gates completos da issue.

## Arquitetura e transição

Aplicados `AGENTS.md`, `ARQUITETURA.md`, ECC TDD/verification-loop, skill `arquiteto-nextjs` e guias locais Next.js sobre static export e Server/Client Components. Pages continuam composição; autenticação consulta API no navegador. As três entradas auth não tinham Suspense anterior; o componente público agora contém Suspense em torno de `useSearchParams`, preservando exportação e as 22 rotas.

Providers deixou de importar `useDemoState` e `useStudyTools`. Não lê, remove, migra ou envia chaves/blobs anteriores. `SessionClient` mantém identidade em memória obtida somente por cookie HTTP. O contexto de compatibilidade contém coleções vazias, própria conta quando existente e placeholder inativo sem identidade quando anônimo. Comandos anteriores recusam a operação sem gravar nem anunciar sucesso.

O shell permite montar inicialmente apenas `/perfil` e entradas auth públicas. Rotas aguardando sua issue ficam atrás de guard explícito, sem montar componentes/hooks/ferramentas legados nem representar uma resposta vazia da API. `httpRoutes` documenta a lista a expandir pelas próximas fatias. A versão anterior integral permanece no checkout/revisão anterior e na cópia estática isolada preparada pelo agente principal; não existe combinação de identidades HTTP com dados locais. Essa transição é temporária; não reduz o escopo das demais issues.

## RED/GREEN observado

- Antes da implementação, `node --experimental-strip-types --test tests/session-client.test.ts` falhou (exit 1) por `ERR_MODULE_NOT_FOUND` de `src/providers/session-client.ts`. Esse primeiro RED comprova ausência da implementação; ainda não executava os casos individualmente.
- Criado controlador/provedor: mesmo comando passou inicialmente 5/5 casos.
- Após revisão sobre cache privado, adicionado caso `new session for same account and expiry or changed role invalidates private query identity`. RED real: 7 passaram, 1 falhou; `assert.notEqual` recebeu `session-1` nos dois lados para nova sessão da mesma conta com expiração idêntica.
- Correção: DTO de sessão com `sessionId` público opaco separado do cookie; preservar chave só quando sessionId, ID de usuário, papel e expiração são idênticos. GREEN: 8/8 no mesmo comando.
- Outra regressão de papel: `profile response revealing a changed role invalidates old permission projections`. RED: 8 passaram/1 falhou, porque o PATCH `/me` com papel alterado preservava `session-1`; GREEN: 9/9 após invalidar a chave e respostas pendentes quando o perfil devolve outro papel/identidade.
- Regressão encontrada no navegador pelo agente principal: login docente, editar nome, ficar offline, disparar foco/refresh e recuperar a sessão perdia o preenchimento ao remontar o perfil. `tmp/aja05-session-offline-draft.js` deu RED com `Draft lost on failed session refresh`. Antes da correção, teste puro `profile draft survives unavailable refresh only after same session is confirmed and never crosses logout or account` também deu RED (`saveProfileDraft is not a function`). Correção guarda somente nome/revisão em memória por sessão pública, conta, papel e contexto de perfil. Estado sem identidade não expõe a composição; restauração exige a mesma sessão confirmada, conserva revisão aberta mesmo se o nome remoto mudou; 401/logout/nova sessão descartam. Teste adicional verifica descarte após 401 mesmo se uma resposta posterior reutiliza o identificador.
- Execução focused final após buffer: `node --experimental-strip-types --experimental-test-coverage --test tests/session-client.test.ts`: 11/11; módulo session-client 100% linhas, 91,23% branches, 91,67% funções. Limpeza de composição ocorre somente no sucesso da gravação da mesma geração, para uma resposta antiga não limpar texto de outra sessão. Não é cobertura do React/browser. O relatório agregado inclui partes de http-client não exercitadas por esta suíte isolada. A revalidação do navegador da regressão fica com o agente principal.
- `npx.cmd tsc --noEmit`: exit 0. `npm.cmd run check:architecture`: exit 0, 156 módulos, sem ciclos estáticos e fronteiras preservadas. Suíte completa, build e revisão independente ficam sob coordenação do agente principal.

## Contratos e comportamento

Testes cobrem sessão ausente, indisponibilidade sem persona local, 401, login incorreto, logout limpando identidade imediatamente, resposta antiga ignorando aborto, atualização de nome com revisão, conflito preservando identidade, revogação em consulta privada, mudança de sessão/papel, wrappers de cadastro/confirmação/recuperação sem sessão local e HTTP real em porta efêmera para login/recarga/logout. Esse servidor de teste não é prova do cookie jar do navegador nem substitui a suíte da API real.

O cliente usa exatamente `/auth/login`, `/auth/session`, `/auth/logout`, `/auth/register`, `/auth/email-confirmation-requests`, `/auth/email-confirmations`, `/auth/password-reset-requests`, `/auth/password-resets`, `/me` e `/me/enrollments`. Cadastro e confirmação não criam sessão no navegador. Links preservam `/cadastro?token=…` e `/recuperar-senha?token=…`. Alterar token na mesma rota recria o formulário para não manter um sucesso anterior. Senha começa vazia; não há credencial fixa, troca de perfil, exploração sem entrada ou painel de falhas/reset.

Após login, destino temporário é `/perfil`, até o painel HTTP da AJA-16. Perfil consulta vínculos, permite solicitar confirmação e salva nome com revisão esperada. Em conflito consulta nome/revisão atuais e exige conferência explícita; mantém preenchimento do usuário em falha de salvamento. Mensagem de solicitação usa a resposta aceita do serviço, sem afirmar entrega externa. UI de privacidade descreve serviço, cookie, escopos e limites atuais do canal institucional.

Refresh em foco/visibilidade e na expiração reconsulta cookie; mesma sessão válida conserva formulário montado, nova sessão/papel invalida a identidade da consulta e remonta conteúdo. Respostas de geração anterior não restauram usuário após logout. 401 em leitura de perfil/vínculos ou gravação de perfil apaga a sessão da interface imediatamente. Uma indisponibilidade ao validar sessão deixa estado de erro sem usar persona ou seed.

## Limites e evidências complementares

O agente implementador não iniciou dev/build/Graphify concorrente. O agente principal prepara navegador candidato na mesma origem do legado para verificar preservação de chaves, rascunho e IndexedDB, duas sessões independentes e demais fluxos reais. O registro da issue deve conter esses resultados efetivos; esta nota não os presume.

Vínculos próprios usam `className` projetado pelo serviço e estado em português; se a turma estiver ausente, mostram “Turma indisponível”, sem expor IDs internos como nome. Não há consulta de disciplinas, avisos ou painel institucional neste pacote. O guard impede apresentar conteúdo local como se fosse HTTP, mas o corte completo dos módulos/transporte legados e inspeção dos artefatos exportados pertencem à AJA-17.
