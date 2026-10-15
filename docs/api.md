# API REST v1

Prefixo `/api/v1`. Swagger `/api/docs`, JSON `/api/openapi.json`. Pedidos JSON com schemas Zod strict partilhados e respostas tipadas. Erros: `{ error: { status, message, fields? } }`; sem stack traces. Listagens administrativas: `{ items, total, page, pageSize }`, limite 100. Pesquisa `search`, filtro de estado `status=ACTIVE|SUSPENDED`.

| Método     | Caminho (sem prefixo)                    | Acesso                                      |
| ---------- | ---------------------------------------- | ------------------------------------------- |
| GET        | /health                                  | Público; PostgreSQL, Redis e worker         |
| POST       | /auth/register                           | Público; CUSTOMER                           |
| POST       | /auth/login                              | Público; email/password/código MFA opcional |
| GET        | /auth/me                                 | Sessão, incluindo enrollment                |
| POST       | /auth/logout, /auth/logout-all           | Sessão, incluindo enrollment                |
| POST       | /auth/forgot-password                    | Público; resposta uniforme 202              |
| POST       | /auth/reset-password, /auth/verify-email | Público; token único                        |
| POST       | /auth/resend-verification                | Sessão; limite de reenvio                   |
| POST       | /auth/change-password                    | Sessão; currentPassword e password          |
| POST       | /auth/mfa/setup, /auth/mfa/confirm       | Sessão, incluindo enrollment                |
| GET        | /users/me                                | Própria conta                               |
| PATCH      | /users/me                                | firstName, lastName, phone                  |
| GET        | /sessions                                | Apenas sessões próprias ativas              |
| DELETE     | /sessions/:id                            | Sessão própria                              |
| GET, POST  | /organizations                           | Associações próprias / cria OWNER           |
| GET, PATCH | /organizations/:id                       | Membership; alteração OWNER                 |
| GET, POST  | /organizations/:id/members               | Leitura de membros / gestão OWNER           |
| PATCH      | /organizations/:id/members/:memberId     | OWNER; papel de organização                 |
| DELETE     | /organizations/:id/members/:memberId     | OWNER; preserva o último OWNER              |
| GET        | /admin/stats                             | users.read; contagens reais                 |
| GET        | /admin/users                             | users.read                                  |
| GET        | /admin/organizations                     | organizations.read                          |
| GET        | /admin/audit-logs                        | audit.read                                  |
| PATCH      | /admin/users/:id                         | users.update; globalRole só SUPER_ADMIN     |
| PATCH      | /admin/organizations/:id                 | organizations.update; status                |
| POST       | /admin/notifications/demo                | system.manage; job real                     |

Mutações públicas exigem Origin=APP_URL. Autenticadas exigem também cookie de sessão e X-CSRF-Token. Login emite ambos os cookies; o cliente central faz isto automaticamente. `GET /auth/me` nunca devolve passwordHash, segredo ou token. IDs nos parâmetros são validados como UUID. Valores secretos de MFA são devolvidos apenas durante enrollment; códigos de recuperação só ao confirmar.

Não existem endpoints de registo real de domínios, pagamento ou DNS.

## Fase 2

| Método        | Path (sem /api/v1)                  | Acesso                               |
| ------------- | ----------------------------------- | ------------------------------------ |
| GET           | /tlds                               | Público; catálogo e preços de venda  |
| POST          | /domains/check                      | Público; Origin e rate limit         |
| GET           | /cart                               | Visitante ou própria conta           |
| POST          | /cart/items                         | Próprio carrinho; cotação no backend |
| PATCH, DELETE | /cart/items/:id                     | Item próprio; PATCH revalida período |
| DELETE        | /cart                               | Próprio carrinho                     |
| GET, POST     | /admin/tlds                         | pricing.manage                       |
| GET, PATCH    | /admin/tlds/:id                     | pricing.manage                       |
| GET, POST     | /admin/pricing                      | pricing.manage                       |
| POST          | /admin/pricing/:id/sync             | pricing.manage                       |
| GET, POST     | /admin/exchange-rates               | pricing.manage                       |
| GET           | /admin/registrars                   | pricing.manage                       |
| POST          | /admin/registrars/openprovider/sync | system.manage                        |
| GET           | /admin/domain-search/metrics        | audit.read                           |
| GET           | /admin/domain-search/logs           | audit.read; paginação/pesquisa       |

Visitantes inicializam o carrinho via GET antes de mutações e usam X-Cart-CSRF-Token. Autenticados usam X-CSRF-Token. Ambos exigem Origin. Documentação OpenAPI inclui schemas partilhados e autenticação opcional do carrinho. Referências detalhadas em domain-search.md, pricing.md e cart.md.

## API comercial /api/v1

- Checkout: POST /checkout; GET /checkout/config e /checkout/:id.
- Encomendas: GET /orders e /orders/:id.
- Pagamentos: POST /payments; GET /payments e /payments/:id; POST /payments/:id/mock-confirm; POST /payments/webhooks/:provider.
- Contactos: GET /domain-contacts?organizationId=UUID; POST /domain-contacts.
- Domínios geridos: GET /domains e /domains/:id (pesquisa /domains/check preservada).
- Documentos: GET /invoices, /invoices/:id e /invoices/:id/pdf.
- Reembolsos: POST /refunds; GET /refunds/:id.
- Administração: GET /admin/orders, /admin/orders/:id, /admin/payments, /admin/registrations, /admin/refunds, /admin/invoices, /admin/operations e /admin/sales.
- Decisões auditadas: POST /admin/refunds/:id/decision, /admin/operations/:id/retry e /admin/registrations/:id/resume; PATCH /admin/tlds/:id/registration-policy.
- Preparação de produção: POST /admin/live-approvals e /admin/live-approvals/:id/approve (não habilitam gateway real).
- Pré-visualização protegida: GET /admin/notifications/preview/:type.

Swagger descreve schemas dos pedidos. Webhooks são autenticados por assinatura e timestamp, sem cookie/CSRF; os restantes pedidos de alteração mantêm Origin/CSRF e permissões. O cliente nunca pode fornecer preços, hashes de verificação, estado de pagamento ou flags de produção.

Dados fiscais por organização: GET /billing?organizationId=UUID e PATCH /billing?organizationId=UUID. Linhas de encomenda: GET /orders/:orderId/items. Pré-visualização HTML/texto de templates: /admin/notificacoes/templates (desenvolvimento, SUPER_ADMIN). Reembolsos do cliente também constam do detalhe autorizado da encomenda.
