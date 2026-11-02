# AJA-05 — identidade HTTP e entrada protegida

Base `43549c1`. Escopo: cadastro, login/sessão/logout, confirmação e recuperação, perfil/vínculos, privacidade, providers e shell. [Servidor](validation-AJA-05-server.md), [cliente](validation-AJA-05-client.md) e [navegador](validation-AJA-05-browser.md) preservam os RED/GREEN e evidências. Aplicados ECC, `arquiteto-nextjs`, guias instalados Next.js e roteiro de navegador. Estado: concluída com revisão independente aprovada.

## Gates finais observados

| Comando | Resultado |
| --- | --- |
| `npm.cmd test` | 185/185, zero falhas, cancelados ou ignorados |
| `npm.cmd run typecheck` | saída 0 |
| `npm.cmd run check:architecture` | saída 0, 156 módulos, fronteiras e ciclos aprovados |
| `npm.cmd run build` | saída 0, Turbopack, 24 páginas em 1367 ms, API desligada |
| Webpack | não executado nesta issue: padrão passou |
| Validador OpenAPI + exemplos | saída 0; 851 exemplos, zero erros |
| `git diff --check` | saída 0 |

`npm.cmd run api:outbox`: saída 0; saída técnica mantida somente em arquivo local, sem publicar tokens. `graphify update .`: saída 0, 834 nós/2961 arestas, artefatos ignorados.

Contrato documental revisto para incluir identificador público de sessão (não credencial) e nome autorizado da turma nos vínculos próprios. Consumidores, exemplos e testes foram atualizados juntos. Verificadores, tokens e caixa local não foram expostos em DTOs ou no frontend. Flags Node para reutilizar regras TypeScript são explícitas, compatíveis com a versão mínima exigida pelo projeto.

## Revisão e limites

Revisão independente `review_aja01` acompanha todo o diff desde a base. Achados corrigidos: nova sessão da mesma conta/cargo mantém chave privada indevidamente; token de formulário mantém sucesso anterior ao trocar query; consultas protegidas 401 precisam limpar sessão; rascunho perdido na falha de consulta de sessão. Não houve dispensa de defeito confirmado. A hipótese visual de sidebar sem atributo foi descartada por fonte/DOM e rechecagem após transição, com motivo registrado no relatório de navegador.

As rotas de identidade/perfil estão integradas. Demais rotas ficam protegidas e explicitamente indisponíveis até suas fatias; não recebem seed, snapshot ou sucesso de mutação local. A versão anterior permanece separada para consulta, e nenhum dado do navegador foi enviado automaticamente. Isso não declara produto completo nem fecha outras issues.

Sessões independentes, HTTP real e Edge foram exercitados. Limites: sem aparelhos físicos, sem outros navegadores/ambientes Linux; HTTPS/Secure e implantação entre sites distintos não foram exercitados localmente. A suíte de sessão mede módulos focados conforme nota do cliente, sem representar cobertura percentual de toda a aplicação. A caixa é somente local, sem provedor externo de e-mail. Downloads e operações acadêmicas permanecem nas issues posteriores.

Parecer final `review_aja01`: **APPROVE**, zero achados pendentes. O revisor conferiu todo o diff desde `43549c1`, contratos e evidências, reexecutou auth+sessão 21/21 e `git diff --check`. A falha de rascunho foi reproduzida e corrigida, incluindo revisão antiga e rejeição 409 em duas sessões. Nenhum defeito confirmado foi descartado.
