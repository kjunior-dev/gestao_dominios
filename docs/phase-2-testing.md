# Validação da Fase 2

Os testes usam NODE_ENV=test, base terminada em _test e Redis DB 1. Sem estas condições, os testes de integração e o servidor E2E recusam arrancar. Nunca utilize uma base existente de produção. As fixtures comerciais estão identificadas como CONTRACT TEST ONLY/E2E CONTRACT MOCK ONLY. Não existem credenciais Openprovider reais nos testes.

## Execução

```bash
pnpm db:generate
pnpm exec dotenv -e .env.test -- pnpm --filter @devtrust/database migrate
pnpm test
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

commerce.unit.test.ts testa IDNA/labels/extensões compostas, parsing monetário exato, markup/margem bruta/fixa, mínimo/arredondamento, autenticação/token cifrado/renovação, resultados premium/ocupados/inesperados, timeout, rate limit e indisponibilidade. O transporte fetch é mockado segundo o OpenAPI oficial; os resultados não verificam conectividade externa.

commerce.integration.test.ts usa Nest, PostgreSQL e Redis reais, com um provider contratual injetado só no processo Vitest. Testa catálogo, orçamento de pesquisa, CSRF, autorização, constraints, preços versionados/auditoria, FX ausente/expirado, cache/stampede, erros UNKNOWN, cotações, duplicados, períodos, isolamento, expiração e associação do carrinho. A suíte platform.integration.test.ts conserva a regressão da Fase 1.

O servidor tests/e2e/api-server.ts recusa ambientes não isolados, cria fixtures comerciais e injeta um provider contratual exclusivamente no processo Playwright. As chamadas do browser passam realmente por Next/proxy/Nest/Prisma/Redis; não são intercetadas para devolver sucesso visual. A aplicação de desenvolvimento e produção não importa este servidor. A suíte testa pesquisa, preços, persistência, login/merge, remoção, erros e responsividade, além dos fluxos de conta/MFA da Fase 1.

## Verificação externa pendente

A tentativa real nesta sessão terminou com PROVIDER_AUTH; não confirmou disponibilidade ou preços externos. Confirme uma conta própria com acesso API e execute `pnpm registrar:verify`; depois teste sincronização, disponibilidade, premium e preços/periodicidade no sandbox oficial ou ambiente real. Não marque pesquisa externa como verificada com base nos mocks. Não existem operações de compra no comando.

## Resultados finais executados em 13/10/2026

| Verificação                                        | Resultado                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| pnpm test                                          | 39 passaram (6 de segurança Fase 1 + 33 comerciais/contratuais)                              |
| pnpm test:integration                              | 65 passaram (35 Fase 1 + 30 Fase 2), em execução isolada                                     |
| pnpm test:e2e                                      | 8 passaram, Chromium, 47,4 segundos                                                          |
| pnpm build                                         | 5 tarefas passaram: contratos, database, API, worker e Next/Webpack                          |
| pnpm lint                                          | Passou, sem erros/warnings de código                                                         |
| pnpm typecheck                                     | Passou, incluindo testes                                                                     |
| pnpm format:check                                  | Passou                                                                                       |
| Migração 202610130002_commerce                     | Aplicada em desenvolvimento e testes sem reset                                               |
| pnpm db:seed                                       | Passou; referências inativas, sem custos/preços inventados                                   |
| Pesquisa de segredos em 207 ficheiros versionáveis | Nenhuma ocorrência dos valores privados; .env, .env.test e o alias privado env com modo 0600 |
| pnpm registrar:verify, configuração local          | Não passou: PROVIDER_AUTH; autenticação externa rejeitada                                    |

Total local: **112 testes passaram**. Os resultados contratuais/E2E não comprovam pesquisa ou preços reais na Openprovider. A primeira verificação externa foi classificada como PROVIDER_UNAVAILABLE devido ao HTTP 500; após a correção, o código documentado é tratado como PROVIDER_AUTH, sem repetir credenciais inválidas.

Uma execução concorrente das suites de integração/E2E sofreu interferência na fila partilhada. Foi interrompida e ambas foram repetidas sequencialmente com sucesso. **Não execute estas duas suites em simultâneo** com a mesma .env.test. A CI já as executa sequencialmente; para paralelizar, crie bases, Redis/filas e mailbox distintos.

Docker Compose/builds de imagens não foram executados porque Docker CLI/daemon não estão disponíveis. O workflow GitHub Actions não foi executado remotamente nesta sessão.

A Fase 2 **não é declarada integralmente concluída**: faltam autenticação, disponibilidade, catálogo e preços confirmados num ambiente externo oficial com acesso autorizado. A validação Docker pendente da Fase 1 permanece igualmente aberta.
