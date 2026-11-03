# Equivalência e consolidação de tipos

## Descoberta entre módulos

Use inventário, termos de domínio e sinônimos para localizar aliases, interfaces, DTOs, unions, brands, parâmetros inferidos, validadores, mappers e fixtures equivalentes. Não buscar apenas nomes idênticos. Staff/Student, Attempt/Submission e Create/Update são candidatos, não prova.

Leia candidatos e consumidores. Quando disponível, use o TypeScript instalado com tsconfig real para resolver aliases/imports/generics; não instale analisador. Busca textual e checks de atribuição produzem candidatos, não identidade semântica. `any`, index signatures e casts podem ocultar incompatibilidade.

## Ficha por grupo

- Símbolos, locais `path:line`, conceito e dono do contrato.
- Campos/significado, obrigatórios/opcionais, ausência versus `undefined`, `null`, readonly/mutabilidade, propriedades extras e index signatures.
- Literais, brands/nominalidade, discriminantes, generics/constraints e funções/overloads quando relevantes.
- Origem/destino, ciclo de vida (criação, patch, persistido, resposta), persona e projeções autorizadas.
- Validação runtime, serialização, coerções/defaults, unidades, datas/timezones e restrições externas.
- Consumidores/testes/fixtures, diferenças comprovadas e perguntas ainda sem evidência.

## Relação e ação

| Relação | Critério | Ação inicial |
| --- | --- | --- |
| Equivalentes | Mesmo conceito, valores, invariantes, ciclo de vida e obrigação de evoluir juntos | Propor definição canônica e migração dos consumidores |
| Sobrepostos | Parte de valores/responsabilidades coincide | Investigar núcleo comum real, não fundir por aparência |
| Subconjunto/superconjunto | Um aceita/exibe mais campos, valores ou permissões | Preservar projeções; base comum só sem exposição ou estados indevidos |
| Divergência acidental | Deveria ser um contrato, mas diferenças alteram comportamento | Correção funcional separada, decisão/aceite e regressão |
| Intencionalmente distintos | Domínio, papel, brand, camada ou evolução justificam separação | Manter separado; testes de contrato quando úteis |
| Evidência insuficiente | Identidade ou invariantes não comprovadas | Decisão humana; percentual de confiança não a torna mecânica |

Igualdade estrutural e atribuição bidirecional não comprovam igualdade de significado. IDs de donos distintos podem ter a mesma representação. DTOs de aluno/equipe podem ter projeções diferentes por privacidade. Não forçar consolidação com união ampla, `Partial`, `Record<string, unknown>`, `any` ou cast.

## Destino e migração

1. Prefira definição existente dona do contrato; senão módulo coeso do domínio com nome honesto para todos os consumidores. Dados compartilhados do AJA em `src/models/` por domínio; props e contratos privados na feature. Não mover runtime schema para arquivo type-only.
2. Desenhe imports antes de mover: modelos usam `import type` direto, índice mantém `export type` explícito e `database.ts` compõe o banco. Sem dependência inversa/ciclo ou contrato privado do serviço no cliente. Preserve `@/models` e entradas públicas de features.
3. Verifique atribuição e usos por forma, tabelas/switches, serialização, defaults, validadores e contratos externos. Discriminante precisa existir e ser garantido em todos os caminhos; campo novo exige migração autorizada.
4. Migre consumidores/reexports, fixtures/testes/configuração. Alias type-only temporário para nome público só quando necessário; registre usuários restantes e condição de remoção. Sem duplicação permanente sem necessidade.
5. Remova definições substituídas só após verificar referências e checks. Typecheck não prova equivalência runtime ou ausência de vazamento; preserve testes de projeções, limites e estados.

Para decisão humana apresente pergunta precisa, alternativas, recomendação, consequências e lotes bloqueados. Não repetir escolha já resolvida: cite decisão/evidência vigente. Uma distinção legítima pode encerrar o achado como manter separado sem exigir escolha de abstração.
