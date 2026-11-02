# AJA-05 — identidade e sessão no serviço

Revisão inicial `43549c1`. Escopo: serviço de autenticação, allowlist do app, configuração, composição do store, CLI de caixa de saída e `tests/http-auth.test.mjs`. Entradas: `server/auth-service.mjs`, `server/app.mjs`, `server/index.mjs`, `server/config.mjs`, `server/outbox.mjs`. Compatibilidade Node 22.6: processos de API em `scripts/dev-full.mjs` e no teste de processo anterior receberam `--experimental-strip-types`, pois a confirmação reutiliza a regra pura de matrícula TypeScript.

## Contrato e arquitetura

Todas as operações públicas e autenticadas usam o store serializado AJA-04 como único escritor. Cadastro, credencial, token, caixa de saída, revisões e auditoria são persistidos juntos; cookie só é emitido depois do commit. Confirmação chama `executeEnrollmentCommand` existente dentro da transação, preservando matrícula única, pendências, prazo anterior ao vínculo e histórico. Falha descarta o clone; não há importação de identidades do navegador nem gravação dupla no seed.

Allowlist exata de método/caminho: saúde, oito operações de `/auth` e sessão atual, `/me` GET/PATCH e `/me/enrollments` GET. Não há router CRUD, static middleware, JSONP, rewrite, rota de outbox, credenciais, tokens ou sessões brutas. Escritas exigem Origin pertencente à lista explícita antes da leitura do corpo. CORS usa a origem autorizada com credentials; preflight admite apenas método declarado e Content-Type. Paths alternativos e métodos não declarados continuam fechados. Erros de leitura de JSON retornam PT-BR sem stack.

Login/sessão retornam `{ sessionId, user, expiresAt }`; `sessionId` é UUID público não credencial, diferente do token secreto/cookie e hash persistido. Serve para invalidar o cache do frontend mesmo ao renovar sessão da mesma conta no mesmo instante de expiração. Somente cookie autentica. Perfis são projetados como `SelfUser`, sem verificadores/campos internos; matrícula usa envelope paginado e projeção própria. Cadastro impõe aluno e não inicia sessão. Campos adicionais como `role` no corpo são rejeitados com 422, nunca concedem acesso.

Cookie `aja_session` usa Path `/api/v1`, HttpOnly, SameSite=Lax e expiração absoluta de oito horas por padrão. HTTPS ativa Secure; desenvolvimento usa host 127.0.0.1 nas três portas. Sessões são aleatórias, persistidas somente como hash, e revalidam conta atual em cada operação. Logout revoga a sessão e limpa o cookie com o mesmo Path. Login inválido também encerra uma sessão anterior, evitando recarregar a identidade errada depois de uma tentativa de troca. Redefinição revoga todas as sessões da conta. A sessão de outra conta ou outro navegador permanece independente.

Tokens de confirmação/recuperação são aleatórios, hash persistido, ligados à conta, finalidade e endereço de e-mail na emissão. Expiram em 30 minutos por padrão, são de uso único e reenvio invalida links anteriores. Consumo concorrente é serializado. Solicitação de recuperação tem a mesma resposta 202 para endereço existente/desconhecido; a mensagem confirma solicitação, não entrega externa. Links só são visíveis ao operador via `server/outbox.mjs`, fora do HTTP. As credenciais usam scrypt; senhas nunca retornam em JSON nem são copiadas para auditoria.

## ECC RED/GREEN observados

Comando: `node --experimental-strip-types --test tests/http-auth.test.mjs`.

- RED antes de implementação: cinco testes falharam porque as rotas ainda retornavam 404 (esperados 401/422/202/403/500 conforme o cenário). Os testes HTTP já usavam o app real, store privado e duas sessões de cookie independentes.
- GREEN inicial: 5/5.
- Regressão de login errado com sessão anterior: RED `200 !== 401` no refresh posterior; correção revoga e limpa a sessão antiga atomicamente. GREEN.
- Regressão de token emitido para endereço depois alterado: RED `200 !== 422`; token passou a vincular o e-mail de emissão. GREEN.
- Sessão pública opaca exigida pela revisão: RED `undefined !== string`; adicionado `sessionId` sem credencial. GREEN.
- Nome legível da turma no vínculo próprio: RED `undefined !== 'Turma Horizonte'`; projeção passou a incluir `className` sem baixar a coleção de turmas. Nome ausente retorna null e preserva o histórico. GREEN 10/10.
- Resultado focado final: **10/10 PASS**, zero falhas/skips. Em execução conjunta anterior com a suíte de processo/infraestrutura, 14/14 PASS (8 de auth àquele ponto e 6 de infraestrutura).
- Suíte completa `npm test` executada por implementador e coordenador: **182/182 PASS**, zero falhas/skips, antes da última projeção de nome (revalidada pela suíte focada).

Casos adicionais verificados: senha incorreta, duplicidade e tentativa de papel no cadastro, reload, atualização isolada do nome, revisão obsoleta, matrícula própria, logout, expiração, conta inativada, dois logins da mesma conta com IDs diferentes apesar de mesma expiração, token inválido/expirado/reutilizado, reenvio, concorrência em confirmação e reset, login somente com nova senha e invalidação das sessões antigas, Origem vedada/ausente, preflight, rotas privadas fechadas e falha de persistência sem usuários/credenciais/tokens/outbox/auditoria parciais. Confirmação com turma inativa preserva banco/token em 409; matrícula cancelada não é restaurada.

Sem medição percentual de cobertura. Gates globais, browser/teclado/responsividade e revisão independente final são registrados pelo coordenador. As operações acadêmicas posteriores continuam nas próximas issues; esta validação de identidade não as declara migradas.
