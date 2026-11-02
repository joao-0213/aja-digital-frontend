# AJA-05 — navegador (em andamento)

Base `43549c1`, Microsoft Edge controlado por `playwright-cli`, sessões independentes `aja05a` e `aja05b`. Aplicadas a skill de navegador e as verificações pertinentes de `VALIDACAO.md`. Nenhuma resposta de sucesso foi interceptada. API real na porta 3002, Next dev na 3000; persistência isolada em `tmp/aja05-browser-runtime` (NODE_ENV=test só autoriza o diretório temporário, sem bypass de sessão). A revisão e os gates finais ainda não concluíram esta issue.

`npm.cmd test` após as correções atuais: **183/183**, zero falhas, cancelados ou ignorados. Contrato recebeu `sessionId` opaco não autenticador e `className` opcional no vínculo; validação estrutural e dos 851 exemplos passou na revisão de sessão (reexecutar após o último acréscimo de vínculo no aceite final).

## Resultados observados

- Antes do candidato, a exportação preservada `tmp/legacy-43549c1/out` foi servida na mesma origem. Login legado e alteração real de nome geraram snapshot local válido de 17.380 caracteres. SHA-256: `6926fba5f5a11eb9d84ff90d4ffe9fdc39c093538f7826ff685de6dccd4e61b2`. Também foram preparados rascunho de fórum e Blob no IndexedDB existente.
- Na mesma sessão/origem, `/perfil` do candidato redirecionou para login: papel `student` e usuário legado `u1` não autorizaram acesso HTTP. Campos de credenciais estavam vazios; não havia controles de persona, exploração sem login ou reset.
- Senha incorreta enviada por Enter retornou alerta PT-BR; e-mail e senha digitados foram preservados. Login real de Alex na sessão A e Bia na B chegou a `/perfil`, sem herdar identidade da outra sessão.
- Reinício do processo da API preservou as sessões, e os perfis voltaram após recarga. Vínculos mostraram nomes autorizados das turmas; nenhum leitor usou a base local para resolver nomes.
- Falha real de rede do contexto A durante PATCH de nome: erro de indisponibilidade, texto preservado e nenhum sucesso local. Rede restaurada, nova tentativa HTTP 200 e recarga conservaram `Alex Navegador`. Bia permaneceu `Bia Aprendiz` após sua recarga.
- Após esses fluxos, a hash local, papel/usuário legados, composição e bytes `LEGACY_FILE_PRESERVED` continuaram exatamente iguais. Script local `tmp/aja05-check-legacy.js` verificou todos, sem importar ou enviar esses dados à API.
- Perfil em 390/768/1440 px: nenhum overflow horizontal global; capturas abertas para inspeção visual. Privacidade abre modal, Tab não alcança controles do fundo, Escape fecha e devolve foco ao gatilho após a limpeza do efeito. Menu móvel abre e fecha por Escape. O navegador pode levar foco à própria interface, representada por BODY no DOM, mantendo o modal nativo e o fundo inerte; o teste inicial excessivamente estrito foi corrigido, sem alteração do componente Dialog.
- Sidebar desktop: recolhida a 80 px, rótulos com opacity 0; hover expande para 240 px sem deslocar o conteúdo. Uma captura inicial feita durante a transição exibiu rótulos parciais. A hipótese de atributo ausente foi descartada: fonte e DOM preservam `data-expanded`; a checagem final aguarda o estado computado e a captura desabilita animações. Não houve patch desse atributo. Safe-area do botão móvel foi preservada pelo implementador.

Capturas locais: `.playwright/aja05-profile-390.png`, `aja05-profile-768.png`, `aja05-profile-1440-final.png`. Scripts auxiliares e estado dos navegadores permanecem locais. Logs de desenvolvimento observados incluem respostas 401 esperadas e a falha offline provocada; a conferência final de exceções JavaScript está no roteiro estático abaixo.

## Fechamento dos fluxos e regressões

- Cadastro real 201, repetição de e-mail 409 e mensagem neutra de solicitação passaram. O link da caixa privada foi lido pelo terminal; confirmação na UI funcionou, reutilização retornou erro e a conta nova entrou com vínculos vazios. Expiração e consumo concorrente foram cobertos pela suíte HTTP, sem alegar espera manual por expiração no navegador.
- Recuperação completa: pedido pela interface, leitura da caixa no terminal, definição de senha pelo link, recusa de reuso, senha anterior negada e nova senha aceita. A sessão antiga de Alex foi recusada ao recarregar. O formulário não afirmou entrega externa de e-mail.
- Saída e voltar: roteiro com histórico protegido retornou ao login, sem nome privado; consulta real da sessão respondeu 401. Uma primeira versão do roteiro esperava barra final obrigatória e expirou; a versão corrigida compara pathname normalizado e passou. Não foi defeito do produto.
- Conta docente inativada por preparação privada controlada do cenário foi negada na recarga; estado de fixture restaurado depois. Essa preparação não é endpoint administrativo nem prova antecipada da AJA-06.
- Cookie efetivo observado pelo navegador: HttpOnly, SameSite=Lax, Path=/api/v1. Login e comandos entre portas 3000/3002 passaram pelo CORS real, sem interceptar sucesso.
- Falha real adicional: perfil em edição perdeu nome após erro da atualização automática da sessão. RED do roteiro `tmp/aja05-session-offline-draft.js`: `Draft lost on failed session refresh: Daniela Estudos`. Correção criou buffer em memória por sessão/conta/papel/revisão; GREEN no mesmo roteiro. Com outra sessão editando o mesmo perfil, a composição antiga manteve a revisão, recebeu 409 e só gravou após botão de conferência explícita. Uma execução intermediária coincidiu com Fast Refresh de fonte ainda em edição; a sequência final foi repetida com fontes congeladas e passou.
- Build padrão com API desligada: saída 0, Turbopack, 24 páginas em 1367 ms. Servido `out/` na porta 3000, sessão nova `aja05static`: login docente, falha transitória de sessão com texto preservado, nova tentativa, PATCH real e recarga aprovados. 390/768/1440 px sem overflow, capturas `.playwright/aja05-static-*.png` inspecionadas; listener `pageerror` registrou zero erros no roteiro estático. Logs de rede 401/offline provocados são distintos de exceções JavaScript.
- A hash, sessão, composição e Blob legados foram conferidos novamente sobre a exportação estática e permaneceram intactos. Busca em `out/` por credenciais do seed, salt e conta criada no teste não encontrou ocorrências.

Gates finais e parecer independente são consolidados em `validation-AJA-05.md`. Roteiros e capturas locais não substituem os testes de regra/persistência.

Next dev `44336` e API anterior `79251` foram encerrados para gerar o build sem API. Processos de conferência estática: preview exec `42295`, API exec `16111`; revalidar handles antes de continuar. Revisão final aprovada conforme o registro consolidado.
