# AJA Digital

Plataforma de apoio a um cursinho pré-vestibular presencial. Reúne materiais, avisos, atividades, questões para praticar e ferramentas de gestão para a equipe docente.

Construída com Next.js 16 App Router, React 19, TypeScript e Tailwind CSS 4. O frontend é exportado como site estático; a API JSON Server roda em processo separado.

## Desenvolvimento

Requer Node.js 22.6 ou superior e npm.

```sh
npm ci
npm run dev:full
```

Abra `http://127.0.0.1:3000`. O comando inicia o site e a API local. Para iniciar cada processo separadamente, use `npm run api` e `npm run dev` em terminais distintos. No PowerShell, use `npm.cmd` se a política de execução bloquear `npm`.

## Build e prévia estática

```sh
npm run build
npm run preview
```

O build gera `out/`; a prévia serve o site em `http://127.0.0.1:3001`. A API deve estar ativa para entrar e consultar dados. Configure `NEXT_PUBLIC_API_URL` antes do build quando a API publicada usar outro endereço. Consulte [docs/http/operator.md](docs/http/operator.md) para configuração de origens, cookies, massa local e operação da API.

Se o build Turbopack falhar ao processar CSS ou iniciar processo, tente `npm run build -- --webpack` e registre os resultados separadamente.

## Verificações

```sh
npm test
npm run typecheck
npm run check:architecture
npm run build
npm run check:export
```

Os testes usam `node:test`. `typecheck` gera os tipos de rota do Next antes do TypeScript.

## Estrutura

- `src/app/`: entradas de rota, metadados, layout e estados de carregamento/erro.
- `src/features/`: módulos por domínio com entradas públicas explícitas.
- `src/components/`: controles reutilizáveis, composições genéricas e shell.
- `src/providers/`: sessão HTTP em memória e contexto de notificações/interface.
- `src/models/`, `src/hooks/` e `src/lib/`: DTOs, hooks, regras e transporte HTTP do cliente.
- `server/`: API separada, regras autoritativas, seed, arquivos de execução e fixtures locais.
- `tests/`: testes de domínio, contrato HTTP e fronteira de imports do frontend.
- `public/`: assets estáticos.

Consulte [ARQUITETURA.md](ARQUITETURA.md) para fronteiras de dependência, armazenamento e manutenção.
