# Armazenamento e corte do perfil antigo

Este inventário descreve o frontend HTTP atual após AJA-17 e a integração padrão ao gateway (`INT-05`). O comportamento legado abaixo serve somente para preservar dados de um perfil existente; ele não é compatibilidade executável do produto atual.

## Armazenamento atual

| Local | Dados | Regra |
| --- | --- | --- |
| Cookie HttpOnly `aja_session` sob `/api/v1` | Credencial emitida e validada pelo serviço HTTP | O browser envia automaticamente (`credentials: 'include'`); JavaScript não lê o valor. Sessão/conta não vêm de um perfil ou chave local. |
| Memória de `session-client` | Identidade consultada, chave de sessão (`sessionKey`), rascunho de perfil e rascunhos/intenções ativos de editores (`readDraft`/`saveDraft`, `readDraftExtra`/`saveDraftExtra` e `useHttpEditor`), incluindo a composição ativa de avisos (`announcement:<userId>:<context>`) | Isolada pela sessão autenticada; descartada imediatamente em troca, logout ou expiração de sessão e ao recarregar/fechar a página. |
| `sessionStorage` por conta/contexto/revisão | `aja-attempt-recovery:*`, `aja-attempt-recovery-owner:*`, `aja-work-v1:*`, `aja-http-forum-compose:*` e `aja-http-forum-reply:*` | Recuperação temporária de respostas de tentativa, entrega de trabalho e pergunta/resposta do fórum (com metadados de upload quando aplicável); não armazena bytes do anexo nem substitui resposta da API ou autoriza acesso. A feature apaga sua chave após confirmação/descarte. |
| Memória React | Filtros, diálogos, navegação, loading e notificações | Volátil. |
| API institucional via gateway (`http://127.0.0.1:3002/api/v1` por padrão, ou `NEXT_PUBLIC_API_URL` no build) | Dados institucionais, sessões, arquivos e projeções autorizadas | Fonte institucional padrão no ambiente integrado (`npm run dev` e `npm run preview`); acessada exclusivamente por `/api/v1`. |
| JSON Server mock em `server/runtime/` (`http://127.0.0.1:3102/api/v1`) | Massa fictícia, sessões, arquivos e coleções locais do contrato | Persistência local opt-in exclusiva dos modos isolados `npm run api` e `npm run dev:mock` (e diretórios temporários em testes); área privada fora do Git e de `out/`. |

O frontend não usa `localStorage` para dados institucionais, não usa `sessionStorage` para composição de avisos (`aja-notice-draft:*` é apenas chave histórica preservada), não usa IndexedDB para arquivos e não coordena gravações institucionais por Web Locks. Arquivos submetidos passam por `/files`; o browser não confirma upload/publicação antes da resposta HTTP.

## Armazenamento legado preservado

Um perfil anterior pode conter stores abaixo. A aplicação atual não consulta, migra, normaliza, grava, apaga ou envia esses valores na primeira abertura.

| Store legado | Conteúdo possível | Ação no corte |
| --- | --- | --- |
| `localStorage` `aja-digital-demo-v1` | Snapshot antigo com contas, respostas e registros | Preservar intacto; não é seed, cache ou fonte institucional atual. |
| `sessionStorage` `aja-demo-role`, `aja-demo-user` | Papel e ID escolhidos no modo anterior | Preservar; não representam sessão e não concedem acesso. |
| `localStorage` `aja-demo-email` | E-mail lembrado | Preservar como preferência antiga; não preencher nem enviar automaticamente. |
| `sessionStorage` `aja-attempt-*` e `:questions-updated` | Respostas temporárias/versões de tentativa anteriores | Preservar; não importar para tentativas atuais (o fluxo HTTP usa `aja-attempt-recovery:*` e `aja-attempt-recovery-owner:*`). |
| `sessionStorage` `aja-notice-draft:*`, `aja-forum-compose:*`, `aja-forum-reply:*`, rascunhos de atividade antigos | Rascunhos e metadados de anexos do legado | Preservar os bytes; não retomar nem apagar automaticamente. A composição ativa de avisos usa somente memória da sessão (`session-client` / `useHttpEditor`), e as telas HTTP do fórum usam somente os namespaces `aja-http-forum-compose:*` e `aja-http-forum-reply:*`. |
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
