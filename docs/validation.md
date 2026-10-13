# Validação da Fase 1

Validação local em 13 de outubro de 2026, macOS, Node 22.14.0 e pnpm 9.15.2. PostgreSQL 17 e Redis foram iniciados em instâncias novas e isoladas, apenas no loopback. Nenhuma base pré-existente foi apagada ou reinicializada.

| Verificação executada                                                  | Resultado                                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                       | Passou; instalação reproduzível                                                                 |
| `pnpm db:generate`                                                     | Passou; Prisma 6.19.3                                                                           |
| Migração inicial em bases novas de desenvolvimento e testes            | Passou                                                                                          |
| `pnpm db:migrate` após a migração                                      | Passou; nenhuma migração pendente                                                               |
| `pnpm db:seed` e repetição idempotente                                 | Passaram                                                                                        |
| Bootstrap do primeiro administrador e rejeição de um segundo bootstrap | Passaram em PostgreSQL isolado                                                                  |
| `pnpm typecheck`                                                       | Passou, incluindo aplicações, UI, contratos e testes                                            |
| `pnpm lint`                                                            | Passou, sem erros ou warnings de código                                                         |
| `pnpm format:check`                                                    | Passou                                                                                          |
| `pnpm build`                                                           | Passou: API, worker, pacotes e Next.js com Webpack/PostCSS                                      |
| `pnpm test`                                                            | 6 testes unitários passaram                                                                     |
| `pnpm test:integration`                                                | 35 testes de integração passaram                                                                |
| `pnpm test:e2e`                                                        | 6 testes Chromium passaram                                                                      |
| `pnpm audit --prod --audit-level moderate`                             | Nenhuma vulnerabilidade conhecida encontrada                                                    |
| `pnpm dev` completo                                                    | API, worker e Next iniciaram; health retornou database/redis/worker `ok`                        |
| Revisão visual                                                         | Homepage clara/escura e dashboard inspecionados; loading de organizações e contraste ajustados  |
| Responsividade                                                         | Larguras 375, 768 e 1440 verificadas pelo navegador; sem overflow horizontal nos casos testados |
| Hidratação                                                             | Nenhum aviso de hidratação no teste da homepage                                                 |
| Pesquisa de segredos locais em ficheiros versionáveis                  | Nenhuma ocorrência dos valores secretos gerados localmente                                      |
| YAML Compose                                                           | Parse e referências entre serviços validados; rede interna e portas coerentes                   |

Total: **47 testes automatizados passaram**. Os testes usaram exclusivamente `devtrust_test` e Redis DB 1. E2E também recusa arrancar sem NODE_ENV=test, nome de base terminado em `_test` e Redis DB 1.

## Cenários de integração

Registo e email duplicado; Argon2id; credenciais corretas/incorretas e bloqueio; Origin/CSRF; logout, logout-all e revogação individual/estrangeira; sessões expiradas/revogadas; confirmação de email, token expirado/usado; recuperação uniforme, token de reset expirado/usado e invalidação de sessões; alteração de password; bootstrap; OpenAPI; health completo; criação transacional e integridade relacional; isolamento de organização; escalada de privilégios; gestão OWNER, proibição MEMBER e remoção/revogação de acesso de membros e preservação do último OWNER; MFA cifrada, códigos de recuperação hashed, login TOTP, anti replay e recovery code de uso único; paginação/contagens reais/auditoria; alterações administrativas autorizadas e revogação de sessões; processamento BullMQ, duplicados, retry/backoff e falhas persistidas em PostgreSQL.

## Cenários end-to-end

Homepage, pesquisa honesta sem disponibilidade inventada, light/dark, responsividade; redirecionamentos anónimos; registo/login/perfil/organização/logout; bloqueio de cliente em admin; erros claros; confirmação e recuperação através dos links reais com fragmentos escritos pelo worker na caixa local; enrollment MFA pela interface administrativa e consulta real de utilizadores/auditoria e erro de confirmação ao tentar remover o último OWNER.

## Limitações de execução

- **Não executados:** `docker compose config`, `docker compose up --build` e builds de imagens Docker. Não há Docker CLI/Desktop, OrbStack, Colima, Podman ou daemon/socket Docker disponíveis. A validação YAML não substitui o teste dos containers.
- O workflow GitHub Actions foi criado, mas **não foi executado no GitHub** nesta sessão. Os seus comandos de aplicação e testes foram executados localmente.
- O build Turbopack foi tentado e falhou com `EPERM` ao abrir uma porta interna durante processamento CSS. O projeto usa o pipeline oficial Tailwind/PostCSS e `next build --webpack`, que passou. `next dev` mantém Turbopack e foi executado com sucesso.
- Os avisos de deprecation de ESLint 9 e helpers otplib 12 são registados em `security.md`; não são erros de lint nem vulnerabilidades de produção reportadas pela auditoria final.
- A caixa de correio é exclusivamente de desenvolvimento e o worker rejeita produção até existir um transporte transacional apropriado. Integrações comerciais, pagamentos e DNS permanecem fora do âmbito.

A Fase 1 **não é declarada integralmente concluída**: falta validar os containers num ambiente com Docker para satisfazer esse critério de aceitação.
