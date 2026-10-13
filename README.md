# DevTrust Domains

Plataforma de venda e gestão de domínios para a DevTrust, Cabo Verde. A Fase 1 implementa contas, organizações, segurança e administração; não efetua compras, pagamentos ou consultas de disponibilidade.

Estado da entrega: a aplicação e os testes locais foram validados; a aceitação integral depende da execução do Compose num ambiente com Docker. Resultados e comandos não executados: [validação](docs/validation.md).

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
# Defina também uma SEED_PASSWORD de desenvolvimento com 12+ caracteres.
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
