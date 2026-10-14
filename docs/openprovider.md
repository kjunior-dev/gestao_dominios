# Openprovider

Contratos consultados em 13/10/2026: [portal oficial](https://developer.openprovider.com/), [guia atual](https://developer.openprovider.com/get-started.html), [OpenAPI publicado](https://developer.openprovider.com/data/swagger.json), [docs](https://docs.openprovider.com/), [sandbox oficial](https://support.openprovider.eu/hc/en-us/articles/8095671860114-Sandbox-Testing-Environment), [limites](https://support.openprovider.eu/hc/en-us/articles/218390187-What-are-Openprovider-API-calls-limits) e [códigos de erro](https://support.openprovider.eu/hc/en-us/articles/216644928-API-Error-Codes).

Existe uma discrepância documental: o portal atual e os paths do OpenAPI publicam produção `/v1`; artigos históricos ainda mostram `/v1beta`, e o guia específico de sandbox publica `/v1beta`. A aplicação usa produção `https://api.openprovider.eu/v1` e aceita sandbox `https://api.sandbox.openprovider.nl/v1beta`. A allowlist impede hosts arbitrários. As duas versões responderam a pedidos sem credenciais; isso não confirma uma conta autorizada.

Operações utilizadas:

| Método | Path relativo   | Contrato relevante                                                                         |
| ------ | --------------- | ------------------------------------------------------------------------------------------ |
| POST   | /auth/login     | username/password → envelope code=0 e data.token                                           |
| POST   | /domains/check  | domains[{name,extension}], with_price e additional_data.idn_script opcional → data.results |
| GET    | /domains/prices | domain.name, domain.extension, operation=create, period → data.price.reseller e is_premium |
| GET    | /tlds           | limit/offset/status=ACT → data.results e total                                             |
| GET    | /tlds/{name}    | with_price=true → preços do TLD e período mínimo                                           |

O catálogo pagina em lotes de 100, com limite de segurança de 10 000 entradas. A sincronização de custos sem nome concreto aceita apenas o período mínimo documentado; os restantes períodos exigem configuração comercial explícita e cotações específicas via domains/prices. Não se multiplica um preço anual presumido. Scripts IDN devem ser configurados segundo as restrições do TLD; não se adivinha a língua.

Configuração backend: OPENPROVIDER_ENABLED, OPENPROVIDER_BASE_URL, OPENPROVIDER_USERNAME, OPENPROVIDER_PASSWORD, OPENPROVIDER_TIMEOUT_MS, OPENPROVIDER_TOKEN_TTL_SECONDS, OPENPROVIDER_REQUESTS_PER_MINUTE. Quando enabled=true, credenciais ausentes impedem o arranque. Mantenha `.env` fora de Git, com permissões 0600. Produção e sandbox têm contas distintas e exigem acesso API autorizado no painel do fornecedor.

Após configurar credenciais próprias, execute `pnpm registrar:verify`. O comando autentica e consulta example.com, sem comprar ou alterar recursos; imprime apenas resultado interno, sem token. Depois faça login como SUPER_ADMIN com MFA, sincronize o catálogo, aprove TLDs e configure câmbio/margens. A configuração de credenciais não equivale a uma integração verificada.

Durante a execução foi adicionada configuração de credenciais ao `.env` local. `pnpm registrar:verify` foi executado e terminou com PROVIDER_AUTH (autenticação rejeitada), sem obter token ou resultados reais. A primeira tentativa classificou o HTTP 500 como indisponibilidade; após consultar o código documentado de autenticação, o cliente foi corrigido para não repetir erros permanentes de credenciais. Pedidos sem credenciais a /v1 e /v1beta devolveram HTTP 500/código 901, documentado como username vazio. Não se conclui daí que o serviço estava indisponível ou que uma conta é válida. Os contratos passaram com mocks; autenticação, disponibilidade e preços reais continuam pendentes de uma conta com acesso API autorizado.

## Diagnóstico de autenticação

Na investigação local, as credenciais estavam presentes, os valores carregados coincidiam com `.env` e o alias `env`, sem espaços externos; a base era `https://api.openprovider.eu/v1`. Um POST direto de login devolveu HTTP 500/código 196, sem token. Isto comprova rejeição do login pelo fornecedor, não expiração de um bearer em cache. O código 196 não permite distinguir sozinho password incorreta de políticas de acesso da conta.

Confirme as credenciais do contact person no ambiente correto, Account overview → Contact persons → API → Enable API access e eventuais restrições de IP. Não altere a base de produção para sandbox sem credenciais próprias desse ambiente. Reinicie a API após editar `.env`; o ficheiro `env` não é carregado pelo comando normal de desenvolvimento.

`pnpm registrar:verify -- --auth-only` verifica exclusivamente autenticação e estado seguro da cache. Sem esta opção também consulta example.com, sem comprar recursos. Os logs nunca incluem descrições externas, passwords ou tokens.

| Situação                                          | Erro interno                                     | Renovação           |
| ------------------------------------------------- | ------------------------------------------------ | ------------------- |
| Login HTTP 401 ou código explícito de credenciais | PROVIDER_INVALID_CREDENTIALS                     | Não                 |
| Login código 196                                  | PROVIDER_LOGIN_REJECTED                          | Não                 |
| Pedido com bearer HTTP 401 / código 196           | PROVIDER_TOKEN_REJECTED                          | Uma tentativa       |
| HTTP 403 / códigos 4002, 4003                     | PROVIDER_PERMISSION_DENIED                       | Não                 |
| Código 10005                                      | PROVIDER_IP_DENIED                               | Não                 |
| Código 197 / 10006                                | PROVIDER_ACCOUNT_BLOCKED / PROVIDER_MFA_REQUIRED | Não                 |
| Timeout, rede, 5xx sem erro permanente            | PROVIDER_TIMEOUT / PROVIDER_UNAVAILABLE          | Até três tentativas |

Uma rejeição de bearer pode corresponder a expiração ou revogação; sem informação adicional do fornecedor, não se afirma qual ocorreu. Os testes de transporte usam mocks e credenciais aleatórias. Os testes de cache usam Redis real isolado (base 1), verificando cifra, TTL, expiração, concorrência e recuperação de corrupção.
