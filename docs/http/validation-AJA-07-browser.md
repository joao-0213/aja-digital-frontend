# AJA-07 — navegador (concluída)

Base `a7d5ca4`. Edge/Playwright CLI, contextos independentes, API real 3002 com runtime isolado `tmp/aja07-browser-runtime`; Next dev/3000. API reiniciada após correções finais (handle 31602); Next 62330. Fonte cliente/servidor congelada para QA. Dados fictícios; scripts/capturas `tmp/aja07-*` ignorados.

## Observado

- Administração: login HTTP e listagem das três disciplinas iniciais. Cadastro de Física Integrada em c1 com Daniela/Bruno e ícone Física. Interrupção de rede no POST conservou nome/descrição/equipe; repetir após restaurar conexão respondeu 201. Recarga e filtros combinados por nome sem acento/turma localizaram a disciplina.
- Docente atribuído Daniela abriu detalhe por query string e aba de materiais. Criou Introdução à Física e Experimentos em grupo por POST 201; reordenação de Experimentos para cima respondeu 200 e permaneceu após recarga. Índice/âncoras refletem a mesma sequência. A primeira asserção de reload leu antes da chegada do HTTP; snapshot posterior confirmou a ordem, sem mudança de produto.
- Duas sessões de docentes independentes: Daniela abriu edição; Bruno alterou o mesmo módulo com 200. Daniela recebeu 409, conservou título digitado e precisou abrir/conferir versão atual antes de salvar com 200. Recarga exibiu Introdução conferida. A segunda sessão foi fechada após o roteiro.

## Verificações adicionais realizadas

Reordenação concorrente, revogação durante edição, seleção indisponível, visitas entre sessões da mesma conta/outra conta, falha de visita, escopo aluno/histórico docente, abas/âncoras/teclado, 390/768/1440 e exportação estática. Nenhum aceite desses casos é inferido dos testes de regras/API.

## Roteiros adicionais aprovados

- Administração criou terceiro módulo enquanto docente mantinha a sequência anterior. Reordenação docente recebeu 409, conservou dois módulos na tela até abrir/conferir a ordem atual; só então mostrou o conjunto de três. Nenhum POST foi repetido automaticamente ao reconhecer a revisão.
- Docente manteve módulo aberto com título digitado. Administração removeu sua atribuição pela UI com confirmação; salvar na sessão docente respondeu 403, preservou o texto e desabilitou nova tentativa. Aceitar o aviso de beforeunload e recarregar mostrou erro 404 sem dados da disciplina.
- Administração manteve composição com Bruno selecionado. Em outra sessão administrativa autenticada, um comando HTTP real inativou Bruno. Ao atualizar a sessão no foco, a opção continuou visível como indisponível, com nome e remoção explícita; descrição digitada preservada e salvar desabilitado. Remover a seleção e tentar salvar exigiu conferir a revisão atual, agora sem equipe. Após conferência e confirmação, a composição foi salva sem reinserir o docente.
- Três contextos de aluno: dois da mesma conta e um de outra. Todos viram novidades de Matemática. Interromper a visita automática manteve o aviso e o indicador em outra sessão da mesma conta. Repetir por HTTP 200 limpou o indicador nessa segunda sessão, mas manteve novidades da outra conta. Aluno não recebeu controles administrativos ou disciplina encerrada; leitura direta desta respondeu 404.
- Docente ainda atribuído abriu Matemática histórica em turma encerrada, sem organização de módulos. Leitura e registro de visita responderam 200; escrita em turma fechada também é negada nos testes HTTP.
- Lista, mural e aba de módulos em 390, 768 e 1440 px: nove combinações com largura documental igual ao viewport e zero pageerror no roteiro. Capturas móvel/desktop inspecionadas. Recolher/expandir e âncora para módulo fechado abriram o destino correto. Busca sem resultados mostrou estado vazio.
- Falha na leitura da lista mostrou ação de repetição; restaurar conexão retornou dados filtrados. Enter abriu Nova disciplina, Tab não alcançou o fundo, Escape solicitou descarte e aceitar restaurou foco ao acionador. Ícone Física foi selecionado por foco/Espaço; o input sr-only usa o label como alvo de clique.

Limites: Edge automatizado em workstation, sem aparelhos físicos, outros motores, participantes ou jornada integral com leitor de tela. Publicação nova entre GET/POST e replay revogado têm contraprovas HTTP automatizadas; a UI de publicação pertence às próximas issues. Os domínios posteriores permanecem explicitamente indisponíveis. Exportação estática foi exercitada conforme evidências registradas nesta nota.

## Exportação estática

Build padrão Turbopack exportou 24 páginas com a API desligada. API reiniciada e `out/` servido por `npm run preview` em 3001. Filtro `?turma=c1`, detalhe com `?id=…&aba=materiais`, edição de orientação de módulo via PATCH 200 e leitura após recarga, alternância Mural/Materiais e atividades aprovados. Roteiro estático registrou zero pageerror. Não foi necessário fallback de build.
