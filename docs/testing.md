# Testes

`pnpm test`: testes unitários de segurança, cifragem autenticada, redaction, permissões e validação. `pnpm test:integration`: API Nest real com Supertest, PostgreSQL e Redis isolados, sem mocks de persistência. `pnpm test:e2e`: Playwright Chromium e três processos reais (API, worker e Next).

Copie `.env.test.example` para `.env.test`, crie exclusivamente `devtrust_test`, configure Redis DB 1 e gere uma chave efémera. A suite de integração verifica o sufixo `_test` antes de limpar tabelas e exige `/1` em REDIS_URL. Não use bases existentes com dados a preservar. Não execute integração e E2E simultaneamente na mesma base.

Migre a base de testes antes da suite. E2E usa utilizadores únicos e serviços em 3300/4400. CI usa containers efémeros. Os testes incluem registo/duplicado, Argon2id, login correto/incorreto/limite, Origin/CSRF, logout/all, expiração/revogação, reset/consumo único, confirmação/expiração, alteração de password, permissões e membership, integridade relacional, último OWNER, MFA, anti replay, recuperação MFA, paginação/contagens reais, notificações/duplicados/retry/falha. E2E cobre confirmação e recuperação reais via caixa local, além de homepage sem resultados fictícios, registo/login/perfil/organização/logout, proteção de páginas, erros e larguras 375/768/1440.

A validação de Docker Compose depende de Docker instalado. Resultados e limitações reais encontram-se em `docs/validation.md`; a presença de um workflow não significa que tenha sido executado no GitHub.
