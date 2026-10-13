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

Não existem endpoints de pesquisa/registo de domínios, pagamento ou DNS nesta fase.
