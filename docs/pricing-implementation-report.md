# Relatório — preços DevTrust Domains

## Causa confirmada

No diagnóstico de 15/10/2026, a base da aplicação não continha políticas `TldPrice` nem taxas `ExchangeRate`. Nove pesquisas tinham disponibilidade `AVAILABLE` e erro `PRICE_UNAVAILABLE`. A obtenção do custo na Openprovider não bastava: o serviço exigia uma política comercial ativa para o TLD/período e câmbio válido para CVE.

A autenticação e as consultas de disponibilidade, preço específico de um/dois anos e preço standard por TLD foram verificadas por leituras autorizadas na Openprovider de produção. A conta devolveu custos em EUR. Os totais por período não são necessariamente múltiplos exatos do preço anual. Nenhum domínio foi comprado ou registado. A documentação e os campos consultados estão referenciados em [pricing.md](pricing.md).

## Correções entregues

- Publicação inicial a partir de custo consultado na API, mantendo margem e câmbio como decisões explícitas do administrador. Na origem API, o servidor volta a consultar o custo ao publicar e ignora o valor enviado pelo cliente.
- Políticas independentes de registo, renovação e transferência; venda pública em CVE. A pesquisa/carrinho continuam a trabalhar apenas com registos.
- Custo de conta por `price.reseller`; custo standard de registo prefere `reseller_price` quando disponível. Não há multiplicação implícita do preço anual nem substituição de premium por custo standard.
- Validação financeira com Decimal/BigInt, venda manual auditada para standard, mínimo, margem e arredondamento. Premium ignora a venda manual standard.
- Versões editáveis por nova publicação, ativação/desativação auditada e estado persistido de sincronização. Sincronizar uma versão inativa conserva a sua inatividade e a versão ativa atual, incluindo alterações de estado durante a consulta do fornecedor.
- Diagnósticos separados para política ausente/expirada/desativada, câmbio ausente/expirado/inválido e falhas da API. A disponibilidade confirmada mantém-se quando a consulta do preço falha.
- Cotações individuais assinadas, sem custos públicos, vinculadas aos termos e à validade. Carrinho recalculado no backend, confirmação de alterações de valor/período, aceitação explícita premium e rejeição de assinaturas manipuladas.
- Expiração e moeda verificadas no backend, na interface e no checkout; moedas incompatíveis bloqueadas na fusão de carrinhos. Snapshots de custos e aceitação ficam privados.
- Interface com preço, moeda, período, premium e mensagem “Preço indisponível”; inclusão bloqueada sem cotação válida.

A compatibilidade dos pedidos standard existentes foi preservada: uma inclusão sem token continua a obter uma nova cotação no servidor, sem aceitar preços do cliente. O frontend atualizado envia sempre o token. Premium e alterações dos termos de um item existente exigem confirmação da cotação assinada.

## Validação

| Verificação                          | Resultado                                   |
| ------------------------------------ | ------------------------------------------- |
| Unitários (`pnpm test`)              | 73 aprovados                                |
| Integração (`pnpm test:integration`) | 112 aprovados                               |
| Navegador (`pnpm test:e2e`)          | 12 aprovados, incluindo as fases anteriores |
| Typecheck (`pnpm typecheck`)         | Aprovado                                    |
| Lint (`pnpm lint`)                   | Aprovado                                    |
| Diff (`git diff --check`)            | Sem erros                                   |

Os testes automatizados usam fornecedores simulados e PostgreSQL/Redis isolados de teste. Cobrem domínio normal/premium/ocupado, falhas de autenticação e preços, respostas inválidas, período, EUR→CVE, markup, margem bruta, margem fixa, mínimo, arredondamento, câmbio ausente/expirado, cotação expirada, carrinho válido, manipulação de valores/assinaturas, publicação inicial, ativação, auditoria e sincronização inativa. O navegador confirma preço visível, bloqueio sem preço, aceitação premium e alteração de período antes da confirmação.

A migração aditiva `20261015150000_pricing_quotes` foi aplicada nas bases locais da aplicação (`gestao_dominios`) e de teste. Não foram alteradas credenciais, variáveis de ambiente, margens, taxas de câmbio nem dados de clientes da aplicação.

## Configuração ainda necessária

O código está preparado, mas a base da aplicação continua sem políticas e câmbio por decisão explícita do plano: não criar valores comerciais automaticamente.

1. Em `/admin/pricing`, introduzir uma taxa EUR→CVE verificada, com fonte e validade; adicionar USD→CVE se a conta devolver essa moeda.
2. Selecionar TLD, registrador, operação e período; consultar custo, definir margem e validade e publicar a política. Para períodos sem custo standard inequívoco na API, introduzir custo manual verificado; a pesquisa consulta sempre o custo individual real.
3. Confirmar extensões/ligação ao registrador ativas e repetir a pesquisa. Sem esses dados, o resultado correto continua a ser “Preço indisponível”.
4. Noutra instalação, aplicar a migração, regenerar o Prisma Client e compilar os pacotes antes de iniciar a aplicação.

As definições de pagamentos mock e registo desativado foram preservadas. Não foi publicada uma aplicação remota nem iniciado qualquer pagamento, compra ou registo real.

## Ficheiros alterados

- `apps/api/src/modules/cart/cart.controller.ts`
- `apps/api/src/modules/cart/cart.module.ts`
- `apps/api/src/modules/cart/cart.service.ts`
- `apps/api/src/modules/catalog/catalog.controller.ts`
- `apps/api/src/modules/catalog/catalog.service.ts`
- `apps/api/src/modules/checkout/checkout.service.ts`
- `apps/api/src/modules/domains/domains.service.ts`
- `apps/api/src/modules/pricing/manual-exchange-rate.provider.ts`
- `apps/api/src/modules/pricing/pricing-error.ts`
- `apps/api/src/modules/pricing/pricing.service.ts`
- `apps/api/src/modules/registrars/providers/openprovider/openprovider.provider.ts`
- `apps/web/src/features/admin/commerce.tsx`
- `apps/web/src/features/domains/cart.tsx`
- `apps/web/src/features/domains/domain-search.tsx`
- `docs/pricing-implementation-report.md`
- `docs/pricing.md`
- `packages/contracts/src/commerce.ts`
- `packages/database/prisma/migrations/20261015150000_pricing_quotes/migration.sql`
- `packages/database/prisma/schema.prisma`
- `packages/registrars/src/types.ts`
- `tests/commerce.integration.test.ts`
- `tests/e2e/api-server.ts`
- `tests/e2e/commerce.spec.ts`
- `tests/pricing.unit.test.ts`
- `tests/transactions.integration.test.ts`
