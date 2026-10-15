# Verificação da Fase 3 — 14/10/2026

A entrega foi exercitada no ambiente isolado `devtrust_phase3_test`, Redis DB 1, API 4400 e frontend 3300. As guardas de testes recusam nomes de base sem sufixo `_test`, Redis fora da base 1 e NODE_ENV diferente de test. As consultas de disponibilidade e os registos usam transportes mock. Os testes de filas usam BullMQ e Redis reais.

| Comando                                                   | Resultado observado                             |
| --------------------------------------------------------- | ----------------------------------------------- |
| pnpm test                                                 | 56 testes unitários passaram                    |
| pnpm test:integration                                     | 104 testes de integração passaram               |
| pnpm test:e2e                                             | 10 testes de navegador passaram                 |
| pnpm typecheck                                            | Monorepo e testes sem erros                     |
| pnpm lint                                                 | ESLint sem erros                                |
| pnpm format:check                                         | Formatação sem erros                            |
| NEXT_OUTPUT_DIR=.next-build pnpm build                    | Build das aplicações e packages passou          |
| pnpm db:migrate                                           | Migração aditiva aplicada na base da aplicação  |
| Prisma migrate deploy em .env.test                        | Três migrações aplicadas numa base isolada nova |
| Prisma migrate status / migrate diff na base da aplicação | Schema atualizado, sem diferenças               |

Total das suites executadas: **170 testes**. Fase 3 acrescentou contratos e testes de checkout, webhooks, preços autoritativos, idempotência, domínio ocupado, premium acima do limite, política do TLD, contacto incerto, saldo insuficiente, registo pendente, falha local após confirmação externa, jobs repetidos, reembolsos parciais/rejeitados, MFA, isolamento, métricas por ambiente e retry real de BullMQ. Os E2E incluem pesquisa → carrinho → checkout → pagamento mock → registo mock → domínio simulado → download do comprovativo interno e responsividade.

Erros deliberados de transação ou gateway nos testes geram logs estruturados de falha; esses logs fazem parte da verificação. Nenhum teste envia email real, cobra dinheiro ou cria domínios num fornecedor externo.

## Problemas corrigidos durante a execução

- O enum PostgreSQL DomainOperation da Fase 2 impedia uma tabela com o mesmo nome. O modelo novo foi mapeado para DomainExecution, preservando o enum existente. A primeira tentativa foi integralmente revertida pelo PostgreSQL, confirmado por consultas de leitura; o estado foi recuperado com Prisma migrate resolve --rolled-back e a migração corrigida foi aplicada normalmente. Não se executou SQL manual de recuperação nem se apagaram dados da aplicação.
- A revisão automática inicialmente recusou SQL manual sem inspeção do schema. Essa operação foi abandonada; a recuperação normal do Prisma foi usada depois de confirmar o rollback completo.
- O servidor de desenvolvimento do utilizador ocupava o diretório Next padrão. E2E usa .next-e2e e o build de verificação .next-build, mantendo a execução em 3001.
- A renovação de tokens da integração anterior ainda comparava PROVIDER_AUTH. Foi alinhada com PROVIDER_TOKEN_REJECTED, limitada a uma renovação e sem renovar permissões negadas.
- A validação de TypeScript, ESLint, schemas e métricas encontrou erros durante a implementação; foram corrigidos e as verificações repetidas antes da entrega.

## Não verificado externamente

O sandbox oficial Openprovider não foi executado: falta conta autorizada e validação dos contratos específicos /v1beta. Os testes contratuais publicados baseiam-se no OpenAPI oficial de produção; não comprovam equivalência nem sucesso no sandbox. OPENPROVIDER_SANDBOX_CONTRACT_VERIFIED permanece false por padrão. A autenticação real da Fase 2 continua pendente de correção da conta/acesso API.

Vinti4 foi avaliada através de documentação oficial, sem adesão/credenciais confirmadas; não existe adaptador de cobrança real ativo. Não se testaram transferências bancárias ou reembolsos bancários manuais. Não se validaram regras fiscais de Cabo Verde: os PDFs são apenas comprovativos internos. Não existe transporte de email de produção.

Docker/Compose não foram executados: o comando docker não está instalado neste ambiente. Dockerfile, volumes de packages partilhados e workflow CI foram atualizados, mas a pipeline GitHub Actions não foi executada remotamente. As verificações locais correspondentes foram executadas.

A Fase 3 está validada como fluxo de desenvolvimento/mock. Os critérios dependentes de sandbox oficial, gateway real e operação em produção continuam pendentes. Não declarar vendas reais ou faturação fiscal prontas apenas com base nestes testes.
