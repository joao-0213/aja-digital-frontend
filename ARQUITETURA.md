# Arquitetura do AJA Digital

O projeto organiza a interface em três camadas: elementos genéricos de UI, módulos de domínio e entradas de rota. Next.js App Router compõe as telas; React mantém as interações e os dados da demonstração no navegador. A exportação estática continua configurada em `next.config.ts`.

## Mapa para manutenção

| Responsabilidade | Localização |
| --- | --- |
| Rotas, metadados, Suspense, loading, error e 404 | `src/app/` |
| Controles e apresentação sem regras de domínio | `src/components/ui/` |
| Logo e notificações genéricas | `src/components/shared/` |
| Navegação e controles globais da demonstração | `src/components/layout/` |
| Composição do estado e das notificações | `src/components/providers.tsx` |
| Contrato `useApp()` | `src/providers/app-context.ts` |
| Estado, sessão e mutações simuladas | `src/providers/use-demo-state.ts` |
| Tipos compartilhados e contrato dos dados | `src/models/` |
| Dados iniciais e transporte simulado | `src/mocks/` |
| Regras puras e infraestrutura compartilhada | `src/lib/` |
| Consulta simulada e integração com ferramentas de estudo | `src/hooks/` |

## Domínios

Cada módulo em `src/features/` expõe seus componentes compartilhados e entradas de tela por `index.ts`. Componentes e hooks internos ficam próximos do uso.

| Módulo | Rotas e responsabilidades |
| --- | --- |
| `auth` | `/login`, `/cadastro`, `/recuperar-senha` |
| `dashboard` | `/`, painéis de aluno e equipe, preferências por usuário |
| `classes` | `/turmas`, cadastro e inativação de turmas |
| `subjects` | `/disciplinas`, `/disciplinas/detalhes`, cards, mural, módulos e visitas |
| `materials` | `/materiais`, leitura e publicação local de materiais |
| `assessments` | `/questionarios`, criação, resposta, recuperação e resultado |
| `questions` | `/questoes`, busca e resolução de questões |
| `forum` | `/forum`, `/forum/topico`, perguntas, respostas, votos e soluções |
| `calendar` | `/calendario` |
| `announcements` | `/avisos` |
| `profile` | `/perfil`, dados e documentos do próprio usuário |
| `students` | `/alunos`, `/alunos/perfil`, matrícula e revisão de documentos |
| `attendance` | `/frequencia` |
| `users` | `/usuarios`, alteração dos perfis da demonstração |

## Direção das dependências

- Rotas compõem entradas públicas de features e componentes genéricos.
- Uma feature importa seus arquivos internos diretamente. Integrações entre features usam `@/features/<domain>`; por exemplo, o painel usa `SubjectCard` de disciplinas, e disciplinas usa `MaterialComposer` de materiais.
- Features consomem o contrato `useApp()` de `@/providers/app-context`. A composição de `Providers` permanece no layout raiz para conservar o estado entre navegações.
- Elementos em `ui/` usam utilitários genéricos e outros elementos de UI por import direto. `shared/` pode compor `ui/`. Essas duas áreas não acessam features, contexto da aplicação nem mocks.
- Tipos, regras puras e infraestrutura não importam componentes ou rotas. Dependências circulares são proibidas.
- `components/ui/index.ts` é uma entrada de conveniência com exports explícitos. Ele não aplica uma fronteira cliente a todo o catálogo.

O comando `npm run check:architecture` verifica imports internos, essas fronteiras estruturais e ciclos nos imports e reexports estáticos de execução. Imports exclusivamente de tipos não participam dos ciclos. A checagem de tipos e o build continuam necessários para validar os contratos e as fronteiras do React/Next.js.

## Servidor e navegador

Páginas e layouts permanecem Server Components. Com `output: 'export'`, sua renderização de servidor acontece durante o build. Eles delegam a interatividade a componentes cliente e mantêm os fallbacks de Suspense usados pelas telas com query string.

Estado da demonstração, formulários, APIs do navegador, leitura de parâmetros pela interface e mutações simuladas continuam no cliente. Não há servidor de aplicação, Server Actions nem autenticação autoritativa. Um componente sem hooks ou handlers pode ser compatível com servidor; se importado por um componente cliente, participa desse grafo cliente.

## Contratos que devem ser preservados

- `useApp()`: dados, usuário, perfil, `ready`, `busy`, troca de perfil, entrada, mutação, notificação e restauração.
- `aja-digital-demo-v1`: banco serializado em localStorage, com versão e formato existentes. A validação e as chaves centrais vivem em `src/lib/demo-storage.ts`.
- `aja-demo-role`: perfil da demonstração em sessionStorage. O comportamento de entrada e troca de perfil continua definido pelo estado da demonstração.
- `aja-attempt-<id>`: recuperação de respostas em sessionStorage, mantida na sessão do questionário.
- `aja-subject-seen:<userId>:<subjectId>`: publicações visitadas, com sincronização pelo hook de disciplinas.
- Preferências do painel, e-mail lembrado e IndexedDB `aja-material-files`: mantêm seus formatos e comportamento atuais.
- Rotas de detalhes por query string, como `/disciplinas/detalhes?id=s1`, e todos os parâmetros, âncoras e links existentes.
- Ordem das mutações, latência e falhas do mock, salvamento automático, limpeza dos arquivos em falhas e mensagens de feedback.

## Como alterar uma funcionalidade

1. Localize o domínio na tabela e leia a entrada pública e os componentes envolvidos.
2. Preserve regras compartilhadas existentes; mantenha regras específicas junto ao domínio quando uma nova extração for justificada.
3. Reutilize os elementos de UI e extraia componentes ou hooks por responsabilidade. Crie apenas arquivos necessários.
4. Verifique os consumidores de contratos públicos, as chaves de persistência e os caminhos de falha afetados.
5. Execute `npm test`, `npm run typecheck`, `npm run check:architecture` e `npm run build`. Valide as interações e os tamanhos de tela afetados conforme `VALIDACAO.md`.

Em refatorações sem alteração visual, compare capturas antes e depois com os mesmos dados, perfil, data e viewport. A organização busca facilitar compreensão e mudanças localizadas; ganhos de desempenho precisam ser medidos separadamente.
