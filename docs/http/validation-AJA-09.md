# AJA-09 — validação concluída

Base de implementação: `2898cf00e4d21b3e82a2339fda7887bebc2a7cc2` (AJA-08); o commit independente de instruções `91d85c7` não altera o escopo funcional. Entradas: `/questoes`, `/questions`, `/questions/{id}`, `/questions/{id}/practice`, imagens do acervo e projeção pública reutilizável para seleção de questões. A autoria e a construção de snapshots de avaliação pertencem à AJA-10.

## TDD

- RED: `node --test tests/http-questions.test.mjs`, teste “acervo HTTP filtra antes da paginação e libera gabarito somente na prática”: retornou 404 em vez de 401 porque a rota ainda não existia. GREEN: mesmo comando, 1/1.
- RED: `node --experimental-strip-types --test tests/questions-client.test.ts`, teste “cliente codifica filtros e identificadores e mantém prática separada da leitura”: `ERR_MODULE_NOT_FOUND` para `questions/api.ts`. GREEN: mesmo comando, 1/1.
- RED: `node --experimental-strip-types --test tests/http-questions.test.mjs`, cenário de imagem externa com metadado privado: a propriedade image era devolvida indevidamente (`true !== false`). GREEN: mesmo comando, 1/1 após limitar imagens e projetar somente src/alt.
- RED: `node --experimental-strip-types --test tests/questions-client.test.ts`, cenário “seleção do construtor conserva somente IDs e permite adicionar e remover sem duplicar”: `ERR_MODULE_NOT_FOUND` para o modelo de seleção. GREEN: mesmo comando, 2/2. O construtor, ainda inacessível no shell, passa a consultar o seletor HTTP compartilhado e impede gravar prévias pelo transporte legado; a captura autoritativa dos snapshots será implementada na AJA-10.
- Testes adicionais verificam filtros antes da paginação acima de 100 registros, parâmetros duplicados/desconhecidos, índices e campos inválidos, isolamento de autorais, retirada, imagem e resposta de prática. Não verificam implementação futura de tentativas.

## Verificações executadas

- `npm test`: 257/257 após integração do seletor ao construtor.
- `npm run typecheck`: passou; `npm run check:architecture`: passou (175 módulos).
- `npm run build`: passou com Turbopack padrão. Antes dos builds, a inspeção das portas 3000, 3001 e 3002 encontrou somente o preview estático na 3001; a API foi parada e a 3002 conferida novamente antes do build final. Nenhum serviço foi iniciado na 3000 nesse intervalo. Nenhuma alternativa Webpack foi usada.
- OpenAPI 3.1 validado com `openapi-spec-validator`; 839 exemplos validados sem erro.
- Navegador Edge headless, exportação estática em 3001 e API real isolada em 3002: filtros combinados, busca, abertura por teclado, URL preservada, recarga de q2, imagem com descrição, resolução, volta à busca, ID inexistente/autoral e link copiado reaberto. Foco retornou ao botão e não houve overflow horizontal em 390, 768 e 1440 px. Interrupção das consultas exibiu erro e ambas as ações de tentar novamente recuperaram os dados; o primeiro script de automação interrompeu ao tentar usar uma lista de botões que mudou após o primeiro clique, e o segundo clique foi concluído separadamente.
- Paginação da interface foi exercitada com oito questões adicionais fictícias no runtime de teste isolado: próxima, anterior, abertura, recarga e retorno preservando página. A paginação acima de 100 registros foi verificada na API. O construtor permanece indisponível no shell; sua integração de UI não foi exercitada no navegador.

Revisão independente final por review_aja09_sol (gpt-6.1-sol, médio): APPROVE, zero achados pendentes no diff completo e arquivos novos. Verificação própria do revisor: 3/3 testes focados e whitespace limpo. Critérios verificados; a limitação visual do construtor bloqueado até AJA-10 permanece explícita. O executor Terra atual foi mantido conforme instrução do usuário; a próxima issue será executada por Luna xhigh.
