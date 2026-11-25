# Arquitetura do AJA Digital

## Execução

O produto é uma exportação estática do Next.js 16 App Router. Páginas e layouts compõem rotas e estados; a interatividade vive em componentes cliente próximos do uso. A aplicação não usa Server Actions nem backend Next.js. O browser chama a API sob `/api/v1`; no ambiente integrado, o gateway Kotlin do backend é a fonte padrão em `http://127.0.0.1:3002/api/v1`. O JSON Server permanece disponível apenas como mock local explícito. A API autentica, autoriza, valida regras, persiste e devolve DTOs. Uma falha HTTP permanece uma falha e nunca restaura seed local.

Inicie o Compose integrado no repositório backend e use `npm run dev` para abrir o frontend. `npm run dev:full` é um alias compatível; `npm run dev:mock` inicia o JSON Server em fluxo isolado. A configuração pública da API é incorporada ao build estático, portanto `NEXT_PUBLIC_API_URL` deve ser definida antes de `npm run build`. Operação, contas locais e reset estão em [docs/http/operator.md](docs/http/operator.md).

## Fronteiras de módulo

| Responsabilidade | Localização |
| --- | --- |
| Rotas, metadados, Suspense e estados de carregamento/erro/404 | `src/app/` |
| Controles sem regra de domínio | `src/components/ui/` |
| Notificações e composições genéricas | `src/components/shared/` |
| Navegação e shell autenticado | `src/components/layout/` |
| Providers e sessão HTTP em memória | `src/components/providers.tsx`, `src/providers/` |
| Features de domínio e APIs de cliente | `src/features/<domínio>/` |
| Cliente HTTP, consulta cancelável e DTOs compartilhados | `src/lib/`, `src/models/` |
| Regras autoritativas, persistência, seed e arquivos privados | `server/` |
| Regressões e contratos | `tests/` |

Rotas importam entradas públicas de features. Dentro de uma feature, imports são internos; entre features, use `@/features/<domínio>`. UI genérica não importa features, providers, rotas ou mocks. `npm run check:architecture` verifica as fronteiras estruturais e ciclos.

## Sessão e estado do cliente

`src/providers/session-client.ts` mantém a identidade consultada à API apenas em memória. O cookie HttpOnly é a credencial; IDs públicos de sessão servem apenas para invalidar consultas e rascunhos. `useSession()` expõe sessão e operações HTTP. `useApp()` contém somente `notify`, usado para mensagens transitórias de interface.

O cliente não importa seed, banco institucional completo, transporte mock, callbacks genéricos de mutação, coordenadores Web Locks ou repositório de anexos IndexedDB. As mensagens de erro e sucesso de uma ação dependem da resposta do serviço. Consultas com `useHttpQuery` são canceláveis e identificadas pela sessão e pelos filtros necessários.

## Dados e armazenamento

`server/seed.mjs`, `server/seed.json` e `server/fixtures/` são fontes exclusivas do processo local da API. O diretório `server/runtime/` contém estado mutável local e não é versionado nem publicado em `out/`. O frontend recebe apenas projeções HTTP autorizadas. Credenciais de teste e procedimento de reset ficam no guia técnico do operador.

O perfil anterior pode conter `aja-digital-demo-v1`, `aja-demo-role`, `aja-demo-user`, `aja-demo-email` e o IndexedDB `aja-material-files`. O frontend atual não lê, importa, regrava nem apaga esses dados; essas chaves não criam sessão. Antes do corte, preserve o perfil e faça cópias manuais do conteúdo que precise ser consultado. Não limpe os dados do navegador para abrir a versão nova.

O browser usa o cookie de sessão HttpOnly emitido pela API e memória transitória para estado de sessão e interface. Alguns formulários mantêm recuperação temporária em `sessionStorage`, isolada por conta/contexto/revisão: resposta ainda não enviada de tentativa ou trabalho, composição de aviso e composição/resposta do fórum. Esses rascunhos não confirmam operações, não concedem acesso e são enviados somente após ação explícita à API. Filtros, abas, diálogos e notificações ficam em memória. Não há persistência institucional em `localStorage` nem arquivo institucional novo em IndexedDB.

## Rotas e domínios

As rotas mantêm URLs e parâmetros existentes, inclusive detalhes com query string:

| Rotas | Feature |
| --- | --- |
| `/`, `/login`, `/cadastro`, `/recuperar-senha` | `dashboard`, `auth` |
| `/perfil` | `profile`, `privacy` |
| `/usuarios`, `/turmas`, `/alunos`, `/alunos/perfil` | `users`, `classes`, `students` |
| `/disciplinas`, `/disciplinas/detalhes`, `/materiais` | `subjects`, `materials` |
| `/questoes` | `questions` |
| `/questionarios`, `/questionarios/criar`, `/questionarios/responder`, `/questionarios/resultado` | `assessments` |
| `/avisos`, `/calendario` | `announcements`, `calendar` |
| `/forum`, `/forum/topico` | `forum` |
| `/frequencia` | `attendance` |

O contrato e a cobertura por ação/perfil ficam em [docs/http/openapi.json](docs/http/openapi.json) e [docs/http/route-matrix.md](docs/http/route-matrix.md). A matriz contém 22 rotas de produto e preserva as fronteiras de acesso.

## Linguagem e conteúdo

A interface descreve o serviço como produto educacional e não como demonstração. Não oferece seleção de persona, acesso sem login, reset local ou injeção de falhas. Contas e massas fictícias existem apenas para operação local da API e são documentadas no guia técnico. O uso de “simulado” em questões ou avisos acadêmicos tem sentido pedagógico e permanece. A palavra “fictício” em um enunciado/figura descreve premissas didáticas, não a natureza do portal.

## Manutenção

1. Leia a issue e a matriz HTTP antes de mudar uma feature; confira callers e limites de perfil.
2. Use o servidor para leituras e comandos institucionais. Não use dados de `server/` no cliente nem grave cópias locais em paralelo.
3. Mantenha `useApp()` restrito a interface. Para identidade e requisições autenticadas, use `useSession()` e as APIs da feature.
4. Preserve rotas estáticas, query strings, Suspense, recuperação temporária de formulários e dados legados no perfil do navegador.
5. Acrescente regressões de contrato/regra, execute testes, tipos, arquitetura e build; exercite a rota alterada com a API e uma falha real de rede. Registre limitações em `docs/http/validation-AJA-<número>.md`.
6. Depois de código, execute `graphify update .`; não versione `graphify-out/`, builds ou dados de execução.

O roteiro vigente está em [VALIDACAO.md](VALIDACAO.md); a política detalhada de corte e stores está em [docs/http/storage-inventory.md](docs/http/storage-inventory.md).
