# AJA Digital

Frontend de uma plataforma de apoio a um cursinho pré-vestibular presencial. Reúne materiais, avisos, atividades com prazo, questões para praticar e ferramentas de gestão para a equipe docente.

Construído com Next.js 16, React 19, TypeScript e Tailwind CSS 4.

## Desenvolvimento

Requer Node.js 22.6 ou superior e npm.

```sh
npm ci
npm run dev
```

Acesse `http://127.0.0.1:3000`.

No PowerShell, use `npm.cmd` se a política de execução bloquear `npm`.

## Build e prévia

```sh
npm run build
npm run preview
```

O build gera os arquivos estáticos em `out/`. A prévia abre em `http://127.0.0.1:3001`; mantenha o terminal aberto enquanto estiver usando o site.

Para compartilhar a prévia, execute em outro terminal:

```sh
ngrok http 3001
```

Gere o build novamente após alterar o código.

## Verificação

```sh
npm test
npm run typecheck
npm run check:architecture
npm run build
```

Os testes usam `node:test`. A checagem de tipos gera os tipos do Next.js antes de executar o TypeScript.

## Estrutura

- `src/app/`: rotas, layouts e estilos globais.
- `src/features/`: módulos por domínio, com componentes, hooks locais e entradas públicas.
- `src/components/`: elementos de UI, composições genéricas e navegação.
- `src/providers/`: contrato do estado compartilhado e persistência da demonstração no navegador.
- `src/models/`, `src/hooks/`, `src/lib/` e `src/mocks/`: tipos, hooks, regras e dados de demonstração.
- `public/`: assets estáticos e identidade visual.
- `tests/`: testes de regras e transporte simulado.
- `scripts/preview.mjs`: servidor da versão compilada.

Consulte [ARQUITETURA.md](ARQUITETURA.md) para localizar cada domínio, entender as fronteiras entre módulos e validar mudanças estruturais.

## Demonstração

A aplicação usa dados fictícios e armazenamento no navegador. Autenticação, permissões e envio de notificações são simulados. Materiais enviados ficam disponíveis apenas no navegador em que foram publicados.

O botão **Demonstração**, na parte inferior do menu, permite alternar entre aluno, professor e administrador.

| Perfil | E-mail de exemplo |
| --- | --- |
| Aluno | fernando@exemplo.com |
| Professora | mariana@exemplo.com |
| Administrador | rafael@exemplo.com |

Senha de teste: `Aja@2026`. Use somente dados fictícios.
