# Base de dados

PostgreSQL com UUIDs e Prisma. O ficheiro `packages/database/prisma/schema.prisma` é a referência completa.

| Entidade           | Relações e constraints                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| User               | Email único; status ACTIVE/SUSPENDED; papel global; hashes Argon2id                                     |
| Organization       | Slug único; tipo INDIVIDUAL/BUSINESS; país ISO; status                                                  |
| OrganizationMember | FK utilizador/organização; único `(userId, organizationId)`; OWNER/MANAGER/MEMBER                       |
| Session            | FK User; tokenHash único; csrfHash; expiração/revogação; mfaVerified                                    |
| VerificationToken  | Hash único; propósito; expiração; consumo atómico                                                       |
| MfaCredential      | Um por User; segredo AES-256-GCM; enabledAt; lastUsedStep para anti replay                              |
| MfaRecoveryCode    | Hash único; consumo atómico; FK User                                                                    |
| AuditLog           | Ator/organização opcionais com SetNull; metadata filtrada; índices por data/ator/org                    |
| Notification       | FK User; estado PENDING/SENT/FAILED; sentAt; conteúdo de entrega de credenciais apenas no Redis com TTL |

A migração inicial é versionada. Não usar schema push como estratégia de produção. `pnpm db:migrate` executa `migrate deploy`, sem apagar dados. Novas alterações exigem migrações adicionais.

Criação de organização e OWNER, alteração crítica de conta e auditoria, consumo de tokens e revogação de sessões são transacionais. Gestão de membros e bootstrap usam SERIALIZABLE. É proibido remover o último OWNER; conflitos concorrentes devolvem 409. FKs e constraints impedem relações órfãs e associações duplicadas.

Não há credenciais administrativas fixas. O seed usa SEED_PASSWORD e só cria dados demonstrativos. A base de testes termina obrigatoriamente em `_test`; não partilhar com desenvolvimento ou produção.
