# AJA-08 — evidências de navegador

Base `25c823f`. Edge/Playwright CLI, API real em 3002 com runtime isolado `tmp/aja08-browser-runtime`; Next dev em 3000. Contextos independentes de docente/aluno e sessões adicionais descartáveis. API atual handle89902, Next53949. Fonte congelada após correções; nomes/capturas/scripts `tmp/aja08-*` ignorados pelo Git.

## Publicação e bytes observados

- Docente Daniela entrou pelo login HTTP, abriu Matemática em aba de materiais e Publicar materiais. PDF falso foi rejeitado antes de qualquer POST de upload (contador zero).
- Dois PDFs fictícios válidos geraram títulos automáticos e dois uploads multipart. O POST de lote foi enviado de verdade e respondeu 201 no servidor; a entrega da resposta ao navegador foi interrompida intencionalmente. Campos ficaram bloqueados e Conferir publicação repetiu a MESMA chave e corpo. O replay 201 retornou os mesmos dois IDs, sem nova publicação. Recarga mostrou ambos.
- Materiais gerados: `material-b924bd13-7b09-4a44-bb5a-022db13378d1` (Apoio de proporcoes, arquivo `file-e8c79d69-3c48-47ba-8381-c1c9ed05890a`) e `material-63ec6c34-bae3-48e1-98b0-ab083646aa4f` (Exercicios de proporcoes, arquivo `file-1d5732a7-404e-4671-bb33-9cf19de05543`). IDs são apenas dados de QA locais.
- Aluno em outro contexto abriu o primeiro PDF pela URL, com prévia e download. Nome baixado Apoio_de_proporcoes.pdf. SHA-256 do arquivo salvo e do fixture original: **91b79bc324f4b1b684e0a94f43e03e6a0db69d21d56e66bebc80674e5ad13800**. Metadados HTTP não expuseram bytesBase64, fixture ou authorId interno.
- Marcar como concluído respondeu PATCH200; após recarga permaneceu concluído e desabilitado. Segunda sessão da mesma conta leu um registro concluído; outra conta leu totalzero para esse material, sem herdar progresso.

## Texto, vídeo e colaboração

- Texto de apoio e vídeo por URL publicados por HTTP201 sem falso conflito após o lote anterior. Texto em parágrafos e URL foram preservados.
- Antes da escolha do aluno, vídeo não criou iframe nem requisição externa. Carregar vídeo aqui iniciou uma requisição ao provedor (interrompida para QA). A incorporação não abriu exibiu fallback explícito e link para a fonte.
- Para representar legado real sem alterar seed compartilhado, a API isolada foi parada e um registro de vídeo sem URL foi acrescentado via store transacional somente no runtime de QA. API reiniciada antes das leituras. A tela mostrou Vídeo sem fonte disponível, sem inventar link; docente editou texto com PATCH200 sem exigir URL, e recarga preservou texto/estado.
- Dois docentes em sessões independentes editaram o mesmo vídeo. Bruno mudou título, URL e duração (25min) com200. Daniela recebeu409 e conservou o título digitado. A conferência exibiu título/texto, duração atual e URL atual; após ajustar para conservar os campos de Bruno, reconhecer revisão e salvar, recebeu200 e recarga exibiu o resultado. Uma asserção inicial usou rótulo abreviado incorreto; snapshot confirmou rótulos completos e a continuação passou, sem mudança adicional de produto.

## Verificações adicionais

- Docente reordenou Exercicios de proporcoes para cima (POST 200); recarga manteve a ordem dos oito materiais então existentes.
- Ferramentas opcionais foram exercitadas em contexto independente com registro de `modelContext` simulado: leitura e conclusão usaram HTTP real e refletiram no botão. Contextos sem suporte continuaram utilizáveis. Não valida implementação de navegador físico de WebMCP.
- Interrupção de rede no binário mostrou nova tentativa, que carregou o PDF; ID desconhecido respondeu 404.
- PDF, texto, vídeo, vídeo legado e lista da disciplina em 390, 768 e 1440 px: 15 combinações sem overflow horizontal global. Capturas 390 de vídeo legado e disciplina inspecionadas. Enter abriu publicação; Escape acionou confirmação de descarte. Na primeira passagem, o retorno de foco ficou inconclusivo; a seção final registra a correção e o GREEN de teclado.
- Export estático servido em 3001: login independente, leitura do PDF e progresso existente após recarga; marcar texto concluído enviou PATCH 200 e recarga preservou. No build final após a correção, novo login independente abriu outro PDF, concluiu com PATCH 200 e recarregou com progresso preservado.
- Após correção da revisão, um POST de lote realmente confirmou 201 e teve resposta interrompida. Ao fechar a composição, editar outro material do mesmo módulo salvou 200 e cancelar uma segunda edição não apagou a preparação. Reabrir e conferir repetiu a mesma chave e corpo, retornando 201 com o mesmo ID. Confirmações foram aceitas automaticamente neste roteiro.

## Limites e pendências

Duas sessões independentes no build final: docente abriu edição, administração retirou atribuição (PATCH 200), tentativa de salvar recebeu 403 e preservou texto; nova leitura de bytes recebeu 404. Revisão independente final aprovada, sem achados pendentes. Limites: Edge local, sem aparelhos físicos, outros motores ou leitor de tela integral; registro das ferramentas opcionais simulado, com HTTP real.

## Retorno de foco na composição

- RED no export estático: Enter, Tab, Shift+Tab e Escape com confirmação nativa devolveram brevemente o foco ao botão original; em seguida, `GET /auth/session` respondeu 200, a consulta da disciplina reiniciou e o botão original foi desconectado, deixando o foco no BODY. Com confirmação interna apenas, outro rastreamento manteve o botão conectado, mas o foco terminou no BODY: a troca do diálogo de carregamento pelo formulário criava uma segunda instância.
- GREEN no export estático após manter um único diálogo e usar confirmação interna: `playwright-cli.cmd -s=aja08clean run-code --filename=tmp/focus-isolated2.js` retornou `focus: true` após Enter, Tab, Shift+Tab, Escape, cancelamento da confirmação, descarte confirmado, dois quadros de animação e 500 ms. O botão original “Enviar materiais” recebeu foco.
- GREEN em contexto independente de leitura: `playwright-cli.cmd -s=aja08reader run-code --filename=tmp/focus-edit4.js` preservou o título digitado ao cancelar a confirmação e retornou `focus: true` no botão “Editar material” após confirmar descarte. Estes roteiros são verificações locais de navegador e não integram a suíte automatizada do repositório.
- GREEN para confirmação de publicação incerta no export: `playwright-cli.cmd -s=aja08reader run-code --filename=tmp/focus-pending.js` interrompeu a resposta de um lote realmente confirmado, acionou “Fechar e guardar”, cancelou uma edição de outro material e retomou a publicação. O replay respondeu 201 com a mesma chave, corpo e IDs. O roteiro anterior também cobre uma edição salva entre fechamento e retomada.
- O build padrão final (`npm.cmd run build`, Turbopack) concluiu com código 0 após verificar que as portas 3000 e 3002 não tinham listeners; não foi necessário fallback Webpack. A API foi reiniciada com o mesmo runtime isolado e o export servido em 3001 voltou a exibir “O que é proporção?” e o controle de edição autenticado.
