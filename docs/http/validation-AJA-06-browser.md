# AJA-06 — evidências de navegador

Base `fba87ee`. Edge/Playwright CLI, API real em 3002 e runtime isolado `tmp/aja06-browser-runtime`. Contextos independentes de administração, docente atribuído, aluno e docente provisionado. Next dev/3000, depois `out/` servido em 3001. Dados fictícios. Scripts/capturas `tmp/aja06-*` ignorados pelo Git.

## Jornadas executadas

- Login HTTP administrativo e diretório. Cadastro duplicado respondeu 409 BUSINESS_CONFLICT e conservou campos corrigíveis. Correção criou docente com 201 e DTO sem senha/hash. Link da caixa local permitiu ao próprio docente definir senha e entrar em contexto independente.
- Docente atribuído consultou alunos de c1 sem ações administrativas. `/usuarios` não expôs tabela; requisição direta ao diretório respondeu 403. Perfil de aluno de outra turma respondeu 404 sem dados.
- Administração inativou o novo docente. Cookie antigo recebeu 401 ao salvar nome; recarga voltou ao login. Nome não autorizado não foi gravado. Exclusão lógica posterior respondeu 200 e retirou conta da listagem após recarga. Alterar o único administrador para professor respondeu 409 e preservou cargo.
- Turma: código duplicado 409; corrigir permitiu continuar. Falha de rede no salvamento preservou campos; repetir com conexão restaurada criou com 201. Edição posterior 200 persistiu após recarga.
- Duas sessões administrativas independentes abriram a mesma turma. A segunda salvou; a primeira recebeu 409, conservou texto e ficou impedida de salvar. Abrir a versão atual e confirmar a conferência permitiu salvar com 200, sem substituir silenciosamente a revisão aberta.
- E-mail desconhecido: preview e inclusão 201 pendente, sem criar conta. Cancelamento 200 apareceu no histórico. Aluno ativo em outra turma: preview impediu inclusão e desabilitou confirmação. Conta confirmada sem turma: inclusão 201 e mesmo vínculo após recarga.
- Aluno incluído viu turma no perfil. Encerrar turma encerrou vínculo e cancelou outra pendência atomicamente. Perfil após recarga mostrou histórico encerrado; leitura da turma pelo aluno virou 404. Reabrir não restaurou acesso ou vínculo.
- Encerramento individual de Bia respondeu 200. Histórico mostrou Encerrado após recarga e link abriu perfil autorizado com matrícula preservada.
- Filtro sem resultados mostrou estado vazio. Interrupção de leitura de usuários mostrou erro e ação de repetição. Restaurar conexão/repetir retornou dados filtrados reais.

## Layout e teclado

Quatro rotas (`/usuarios`, `/turmas`, `/alunos?turma=c1`, `/alunos/perfil?id=student-two`) em **390, 768 e 1440 px**. Primeiro roteiro encontrou documento 462 px em viewport 390: rótulo sr-only da coluna sem ancestral posicionado escapava do scroller. Restaurar relative reduziu 462 para 390. Repetição das doze combinações retornou largura documental igual ao viewport. Tabela conserva rolagem própria/foco.

Cadastro abriu com Enter. Tab ficou no diálogo/chrome, sem alcançar fundo. Escape solicitou descarte; aceitar fechou e restaurou foco ao acionador. Capturas de diálogo móvel e perfil desktop inspecionadas. Roteiro final de responsividade/erro/repetição: **zero pageerror**. HTTP 401/403/404/409 e rede interrompida produziram erros de recurso esperados no console.

## Limites

Edge automatizado em workstation, sem aparelhos físicos, outros motores, participantes ou jornada integral com leitor de tela. Identidade após reutilização de e-mail, rollback, legado ambíguo e confirmação repetida também têm testes HTTP reais na nota do servidor; não se infere cobertura apenas de capturas. Repetição estática concluída conforme seção seguinte.

## Exportação estática

Turbopack padrão exportou 24 páginas com API desligada. Depois, API e `npm run preview` foram iniciados. No `out/` servido em 3001: diretório, diálogo com Enter/Tab/Escape e foco restaurado; edição real de código da turma respondeu 200 e permaneceu após recarga; tabela de alunos e detalhe por query string mantiveram histórico após recarga. Uma asserção inicial usava texto exato num parágrafo que também contém datas; snapshot confirmou o conteúdo e a asserção por prefixo passou, sem mudança de produto.
