# Armazenamento e corte do perfil antigo

Este inventário descreve o frontend HTTP atual após AJA-17. O comportamento legado abaixo serve somente para preservar dados de um perfil existente; ele não é compatibilidade executável do produto atual.

## Armazenamento atual

| Local | Dados | Regra |
| --- | --- | --- |
| Cookie HttpOnly `aja_session` sob `/api/v1` | Credencial emitida e validada pelo serviço | O browser envia automaticamente; JavaScript não lê o valor. Sessão/conta não vêm de um perfil ou chave local. |
| Memória de `session-client` | Identidade consultada, rascunho de perfil e chave de sessão | Descartada em troca/expiração de sessão e ao fechar a página. |
| `sessionStorage` por conta/contexto/revisão | `aja-attempt-recovery-*`, `aja-work-v1:*`, `aja-notice-draft:*`, `aja-http-forum-compose:*` e `aja-http-forum-reply:*` | Recuperação temporária de resposta/texto e metadados de upload; não armazena bytes do anexo nem substitui resposta da API ou autoriza acesso. A feature apaga sua chave após confirmação/descarte. |
| Memória React | Filtros, diálogos, navegação, loading e notificações | Volátil. |
| JSON Server em `server/runtime/` | Dados institucionais, sessão, arquivos e demais coleções do contrato local | Única fonte institucional no ambiente local; área privada do processo da API. |

O frontend não usa `localStorage` para dados institucionais, não usa IndexedDB para arquivos e não coordena gravações institucionais por Web Locks. Arquivos submetidos passam por `/files`; o browser não confirma upload/publicação antes da resposta HTTP.

## Armazenamento legado preservado

Um perfil anterior pode conter stores abaixo. A aplicação atual não consulta, migra, normaliza, grava, apaga ou envia esses valores na primeira abertura.

| Store legado | Conteúdo possível | Ação no corte |
| --- | --- | --- |
| `localStorage` `aja-digital-demo-v1` | Snapshot antigo com contas, respostas e registros | Preservar intacto; não é seed, cache ou fonte institucional atual. |
| `sessionStorage` `aja-demo-role`, `aja-demo-user` | Papel e ID escolhidos no modo anterior | Preservar; não representam sessão e não concedem acesso. |
| `localStorage` `aja-demo-email` | E-mail lembrado | Preservar como preferência antiga; não preencher nem enviar automaticamente. |
| `sessionStorage` `aja-attempt-*` e `:questions-updated` | Respostas temporárias/versões de tentativa anteriores | Preservar; não importar para tentativas atuais. |
| `sessionStorage` `aja-notice-draft:*`, `aja-forum-compose:*`, `aja-forum-reply:*`, rascunhos de atividade antigos | Rascunhos e metadados de anexos | Preservar os bytes; não retomar automaticamente. As telas HTTP usam somente o namespace novo `aja-http-forum-*`. |
| IndexedDB `aja-material-files` / object store `files` | Blobs e arquivos locais antigos | Preservar sem abrir ou apagar; esses IDs não identificam anexos do serviço. |

Essa preservação é passiva. Se alguém precisar consultar conteúdo antigo, deve abrir a versão anterior em perfil separado ou copiar manualmente os dados/arquivos pelo DevTools da origem antiga. Não limpar site, não executar reset local do navegador e não usar ferramentas de migração automática.

## Verificação do primeiro acesso

O smoke de AJA-17 prepara um perfil isolado com cada chave acima e um Blob no IndexedDB, abre uma rota estática, recarrega e verifica:

1. O conteúdo de `localStorage`, `sessionStorage` e do registro IndexedDB é idêntico antes/depois.
2. A identidade antiga não aparece no shell e nenhuma rota protegida fica autorizada por essas chaves.
3. A consulta real `/api/v1/auth/session` resulta anônima sem cookie válido.
4. Nenhuma chamada envia o snapshot antigo ou seus anexos ao serviço.
5. A página do fórum e o tópico, autenticados com ID igual ao das chaves anteriores, não leem nem serializam os drafts `aja-forum-compose:*` e `aja-forum-reply:*`; gravações atuais usam somente `aja-http-forum-*`.

Detalhes e logs estão em [validation-AJA-17.md](validation-AJA-17.md) e `evidence/AJA-17/`.
