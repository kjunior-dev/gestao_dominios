# DevTrust Domains

Plataforma de venda e gestão de domínios para a DevTrust, Cabo Verde. As Fases 1 e 2 implementam contas, organizações, segurança, administração, catálogo, pesquisa e carrinho; não efetua compras ou pagamentos. As consultas externas dependem de credenciais Openprovider e configuração comercial válida.

Estado da entrega: a aplicação e os testes locais foram validados; a aceitação integral depende da execução do Compose num ambiente com Docker. Resultados da Fase 1: [validação](docs/validation.md). A verificação real Openprovider da Fase 2 permanece pendente: [testes da Fase 2](docs/phase-2-testing.md).

## Tecnologias e estrutura

Node.js 22 LTS, pnpm 9, Turborepo, Next.js 16.4 / React 19.3, Tailwind 4, componentes shadcn/Radix, NestJS 11, Prisma 6.19, PostgreSQL 17, Redis 7 e BullMQ. TypeScript strict em todas as aplicações. As versões exatas efetivamente instaladas encontram-se em `pnpm-lock.yaml`.

```text
apps/web/src/{app,components,features,hooks,lib}
apps/api/src/{common,config,modules}
apps/worker/src
packages/{database,contracts,ui,config}
infrastructure/{docker,nginx}
docs/
tests/{e2e,...}
.github/workflows/ci.yml
```

## Preparação

Pré-requisitos: Node na versão de `.nvmrc`, pnpm 9.15.2, PostgreSQL 17 e Redis 7; alternativamente Docker com Compose v2.

```bash
cp .env.example .env
chmod 600 .env
# Gere TOTP_ENCRYPTION_KEY e coloque o resultado em .env:
openssl rand -hex 32
# Defina também uma SEED_PASSWORD de desenvolvimento não vazia.
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @devtrust/contracts build
pnpm --filter @devtrust/database build
```

`DATABASE_URL`, `REDIS_URL`, `APP_URL` e `TOTP_ENCRYPTION_KEY` são obrigatórias. A API valida-as no arranque. `API_INTERNAL_URL` é usado exclusivamente pelo servidor Next e pelo proxy. O navegador comunica com `/api/v1` na mesma origem. Não são necessários JWT ou SESSION_SECRET: as sessões usam tokens aleatórios de 256 bits.

## Execução local

Inicie PostgreSQL e Redis com as URLs de `.env`, depois:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Web: http://localhost:3000. API: http://localhost:4000/api/v1. Swagger: http://localhost:4000/api/docs. OpenAPI: `/api/openapi.json`.

O seed cria `cliente@example.test`, uma organização demonstrativa e uma associação OWNER. A password vem de `SEED_PASSWORD`, nunca de um valor de administrador fixo. O seed é idempotente e não altera passwords existentes.

## Docker

```bash
cp .env.example .env
# Configure TOTP_ENCRYPTION_KEY, APP_URL e SEED_PASSWORD.
docker compose up --build -d
# A migração é executada pelo serviço migrate antes de api/worker.
docker compose exec api pnpm --filter @devtrust/database seed
docker compose exec api pnpm --filter @devtrust/database migrate
docker compose logs -f api worker web
docker compose exec worker sh -c 'ls -l /app/.local/mailbox'
docker compose down
```

Os volumes mantêm dados e a caixa de correio. `down` sem `-v` conserva-os. PostgreSQL e Redis só são publicados no loopback em desenvolvimento. As fontes são montadas para hot reload; reinstale/reconstrua após alterar dependências. O Compose fornecido é de desenvolvimento. Veja [deployment](docs/deployment.md) antes de preparar produção.

## Primeiro administrador

Defina temporariamente `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` (16+ caracteres) no ambiente e execute:

```bash
pnpm admin:bootstrap
```

Remova as credenciais do ambiente após o comando. O bootstrap usa uma transação serializável e um advisory lock e recusa executar se já existir SUPER_ADMIN. O primeiro login permite apenas configurar MFA; confirme um código TOTP antes de abrir `/admin`. Guarde os oito códigos de recuperação apresentados uma única vez. Não existe endpoint público para atribuir SUPER_ADMIN.

## Emails de desenvolvimento

O worker não envia emails. Escreve ficheiros JSON com permissões 0600 em `DEV_MAILBOX_DIR` (por omissão `.local/mailbox`, relativa ao worker). Os ficheiros incluem links reais de confirmação e recuperação. A pasta não é versionada. O PostgreSQL guarda apenas hashes dos tokens; o material de entrega fica cifrado temporariamente no Redis, com TTL, e os jobs contêm apenas o ID da notificação. Tokens e segredos nunca são registados nos logs. Abra o link no navegador; a confirmação é efetuada por POST ao premir o botão.

## Verificações

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
# Configure .env.test com base em .env.test.example:
pnpm exec dotenv -e .env.test -- pnpm --filter @devtrust/database migrate
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

Os testes de integração exigem um nome de base terminado em `_test` e Redis DB 1. Limpam apenas essa base isolada. Não configure URLs de produção. A CI cria serviços efémeros e executa todos os grupos. Veja [testing](docs/testing.md) e [validation](docs/validation.md) para cobertura e resultados efetivamente executados.

## Troubleshooting

- Configuração inválida: valide as variáveis obrigatórias, o formato de 64 caracteres hex da chave e as URLs.
- Migração falha: verifique se PostgreSQL está saudável e se a base existe; não use `migrate reset` numa base existente.
- CSRF/origem: `APP_URL` deve coincidir exatamente com a origem no navegador, incluindo porta. Use o frontend e o proxy, não pedidos autenticados entre origens arbitrárias.
- Health 503: o health completo depende de PostgreSQL, Redis e heartbeat do worker. O OpenAPI permite verificar separadamente a disponibilidade da API.
- MFA rejeita código: sincronize o relógio e aguarde um novo intervalo de 30 segundos. Códigos TOTP não podem ser reutilizados no mesmo intervalo.
- Cache Prisma bloqueado: execute com acesso ao cache de ferramentas ou configure `XDG_CACHE_HOME` num diretório gravável; a primeira geração pode exigir rede para os binários oficiais.

## Documentação

[Arquitetura](docs/architecture.md) · [Dados](docs/database.md) · [Autenticação](docs/authentication.md) · [RBAC](docs/rbac.md) · [API](docs/api.md) · [Desenvolvimento](docs/development.md) · [Testes](docs/testing.md) · [Deploy](docs/deployment.md) · [Segurança](docs/security.md).

## Fase 2: catálogo, pesquisa e carrinho

A migração comercial é aditiva. Execute `pnpm db:migrate` e `pnpm db:seed`; o seed cria com/net/org inativos, sem preços fictícios. Configure Openprovider exclusivamente no backend (`OPENPROVIDER_ENABLED=true`, URL autorizada, username/password); depois execute `pnpm registrar:verify`. Sem credenciais, a integração devolve PROVIDER_DISABLED de forma controlada.

No painel, SUPER_ADMIN com MFA pode sincronizar o catálogo em `/admin/registrars/openprovider`. Administradores com `pricing.manage` revêm/ativam TLDs em `/admin/tlds`, configuram taxas verificadas e publicam versões comerciais em `/admin/pricing`. Não existe câmbio implícito: sem uma taxa válida EUR/USD → CVE, o preço convertido é bloqueado. Configure explicitamente cada período pretendido.

Pesquise em `/dominios/pesquisar`; consulte `/dominios/precos` e `/carrinho`. O carrinho persiste para visitantes e contas, é associado após login e revalida disponibilidade/preço no servidor. `/dashboard/dominios` e `/dashboard/encomendas` continuam vazios porque não são efetuadas compras.

[Pesquisa](docs/domain-search.md) · [Registradores](docs/registrar-integration.md) · [Openprovider](docs/openprovider.md) · [TLDs](docs/tlds.md) · [Preços](docs/pricing.md) · [Câmbio](docs/currency.md) · [Carrinho](docs/cart.md) · [Testes Fase 2](docs/phase-2-testing.md).

## Fase 3 — fluxo comercial em desenvolvimento

Checkout, encomendas, pagamentos mock, eventos assinados, outbox, registos/reconciliação, reembolsos e comprovativos internos foram acrescentados. A migração `20261014140000_commerce_checkout` é aditiva e preserva dados das fases anteriores. O enum PostgreSQL `DomainOperation` foi preservado; a nova entidade de operações usa a tabela `DomainExecution`.

```env
PAYMENTS_MODE=mock
DOMAIN_REGISTRATION_MODE=disabled
LIVE_TRANSACTIONS_ENABLED=false
BILLING_MODE=internal
EMAIL_MODE=development
BILLING_TAX_BASIS_POINTS=0
```

`pnpm install`, `pnpm db:migrate` e `pnpm dev` preparam e iniciam o ambiente. `npm run dev` também seleciona Node 22 instalado, mesmo quando o IDE usa outra versão. Na configuração local, a loja fica em `http://localhost:3001`. Não inicie duas execuções nas mesmas portas.

Em testes isolados, DOMAIN_REGISTRATION_MODE=mock permite completar a simulação, claramente identificada. O modo disabled preserva a encomenda paga em análise manual, sem comprar domínios. Sandbox requer base/conta próprias e verificação oficial; não altere as credenciais de produção para testar. Vendas reais continuam bloqueadas por ausência de gateway aprovado, mesmo com flags ou aprovação administrativa.

Páginas: `/checkout`, `/checkout/confirmacao`, `/checkout/resultado/[orderId]`; `/dashboard/encomendas`, `/dashboard/pagamentos`, `/dashboard/faturas`, `/dashboard/dominios`; `/admin/vendas`, `/admin/encomendas`, `/admin/pagamentos`, `/admin/registos`, `/admin/reembolsos`, `/admin/faturacao`, `/admin/operacoes`.

[Checkout](docs/checkout.md) · [Pagamentos](docs/payments.md) · [Webhooks](docs/payment-webhooks.md) · [Registos](docs/domain-registration.md) · [Contactos](docs/domain-contacts.md) · [Estados](docs/order-lifecycle.md) · [Reconciliação](docs/reconciliation.md) · [Reembolsos](docs/refunds.md) · [Documentos internos](docs/billing.md) · [Produção](docs/production-readiness.md) · [Testes](docs/phase-3-testing.md).

Testes E2E usam `.next-e2e` para preservar um servidor de desenvolvimento ativo. Para verificar build sem partilhar artefactos com `next dev`, use `NEXT_OUTPUT_DIR=.next-build pnpm build`; esse build requer a mesma variável ao iniciar o frontend com `next start`. O arranque normal continua a usar `.next`.
