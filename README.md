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

Se o Turbopack falhar ao iniciar o processo de compilação do CSS, execute `npm run build -- --webpack` para gerar a exportação estática com Webpack.

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

O PP01 reduz o perfil a nome/e-mail e dados operacionais, mantém painéis fixos, materiais com acesso direto e questionários com ordem fixa e envio único. O resultado individual permanece disponível. Bancos locais antigos são migrados na mesma chave, preservando respostas e histórico compatível. As histórias e os diagramas revisados estão no complemento local `docs/ESCOPO-PP01.md` e foram incorporados ao DOCX acadêmico indicado pelo usuário. A entrega de redação como arquivo permanece pendente do PP06.

O PP02 acrescenta cadastro, edição, inativação e exclusão lógica de docentes pela administração, além de vários professores por disciplina, com permissões iguais. Turmas, disciplinas, vínculos e atribuições são gerenciados pelo administrador. Consultas, destinos de formulários, URLs e mutações usam regras comuns para limitar o professor às disciplinas atribuídas e o aluno aos próprios registros privados. Os formulários de edição preservam o preenchimento diante de conflito e exigem conferir a versão atual antes de salvar novamente. Histórias, matriz de acesso e diagramas estão em [docs/ESCOPO-PP02.md](docs/ESCOPO-PP02.md) e foram incorporados ao DOCX acadêmico, renderizado e conferido com cópia anterior preservada.

## Demonstração

O PP03 completa a matrícula por e-mail: a administração confere conta e destino, cria vínculo ou pendência; o cadastro posterior exige confirmação simulada. Sem matrícula, o aluno recebe orientação para aguardar inclusão. Cancelamento, saída e encerramento da turma preservam histórico e retiram acesso; não há restauração pela interface. Atividades vencidas antes da entrada ficam só para consulta e aulas anteriores não geram falta. O aviso de privacidade é acessível antes e depois do cadastro. Documentação local em `docs/ESCOPO-PP03.md` e `output/reviews/VALIDACAO-PP03.md`.

Os exemplos novos têm uma turma ativa por aluno. Bancos antigos com múltiplos vínculos ativos são preservados, com orientação para regularização explícita pela administração; o acesso acadêmico ambíguo permanece bloqueado até encerrar o vínculo incorreto. A migração não escolhe turma nem transfere alunos automaticamente.

A aplicação usa dados fictícios e armazenamento no navegador. Autenticação, permissões e envio de notificações são simulados. Materiais enviados ficam disponíveis apenas no navegador em que foram publicados.

O botão **Demonstração**, na parte inferior do menu, permite alternar entre aluno, professor e administrador.

Para testar colaboração, entre como administrador, cadastre outro docente em **Usuários e docentes** e atribua ambos à mesma disciplina. Use o login com o e-mail fictício cadastrado para acessar o segundo professor; a conta selecionada permanece na sessão após recarregar. Inativar ou excluir a conta encerra o acesso sem entrar automaticamente como outro usuário. A autoria das publicações anteriores é preservada.

As alterações entre abas do mesmo navegador são coordenadas com Web Locks e conferência da versão persistida. Use um navegador com suporte a essa API em `localhost` ou HTTPS; quando a coordenação não está disponível, a aplicação explica a limitação e bloqueia a gravação persistida. Isso não oferece colaboração entre dispositivos nem substitui permissões no futuro serviço de dados. Os resultados efetivamente executados ficam em [VALIDACAO.md](VALIDACAO.md) e nos relatórios por pacote em `output/reviews/`.

| Perfil | E-mail de exemplo |
| --- | --- |
| Aluno | fernando@exemplo.com |
| Professora | mariana@exemplo.com |
| Administrador | rafael@exemplo.com |

Senha de teste: `Aja@2026`. Use somente dados fictícios.
