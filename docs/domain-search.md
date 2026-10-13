# Pesquisa de domínios

`POST /api/v1/domains/check` recebe `{ query, extensions?, registrationYears? }`. As extensões são ASCII sem ponto inicial, no máximo dez; o período é um inteiro entre 1 e 10, sujeito ao catálogo. O schema strict partilhado rejeita campos extra.

Fluxo: validação → NFC/lowercase/IDNA → parsing com o catálogo ativo → agrupamento por registrador e script IDN → cache de disponibilidade → fornecedor → cotação específica do domínio/período → preço comercial CVE → histórico técnico. Os nomes com extensão composta utilizam o sufixo mais longo configurado; a extensão de um nome completo é sempre incluída, seguida das alternativas selecionadas, até dez; subdomínios, URLs, espaços internos e labels malformados são recusados. A URL externa nunca deriva do nome pesquisado.

Os resultados públicos incluem domínio, TLD, registrador, `status`, `isPremium`, `cacheHit`, `checkedAt`, `quote` e `errorCode`. Os estados de disponibilidade são AVAILABLE, REGISTERED, RESERVED, UNAVAILABLE e UNKNOWN. PREMIUM é representado exclusivamente por `isPremium`; pode acompanhar AVAILABLE ou REGISTERED. O mapper Openprovider só transforma os estados documentados `free` e `active`; outros estados e resultados ausentes permanecem UNKNOWN. Falhas não produzem disponibilidade fictícia. Uma disponibilidade confirmada com preço indisponível permanece identificada, mas não permite adicionar ao carrinho.

Limites independentes: pesquisas por IP, quantidade de extensões e orçamento global do fornecedor. Sem catálogo ativo, o pedido devolve 503 com uma mensagem de pesquisa indisponível; com catálogo ativo e integração desativada, os resultados são UNKNOWN/PROVIDER_DISABLED. Não existe fornecedor fictício no runtime da aplicação.

As páginas públicas são `/`, `/dominios`, `/dominios/pesquisar`, `/dominios/precos` e `/precos`. Loading, validação, erros, Enter, premium e cotações em CVE usam componentes partilhados. Alternativas são as restantes extensões selecionadas, com resultados efetivamente consultados.

Histórico: DomainSearchLog guarda domínio normalizado, extensão, fornecedor, estado, premium, cache hit, latência e código técnico; não guarda IP, credenciais ou resposta externa. O userId é opcional e preenchido nas revalidações autenticadas do carrinho. `GET /admin/domain-search/logs` oferece pesquisa/paginação; `/admin/domain-search/metrics` agrega dados reais da janela de retenção. O worker remove histórico antigo e carrinhos expirados no arranque e a cada hora. DOMAIN_LOG_RETENTION_DAYS aceita 1–90, por omissão 30; a eliminação pode atrasar até uma hora.

A interface bloqueia a submissão enquanto as extensões carregam ou quando não existe oferta publicada. Falhas de ligação ao carregar as extensões apresentam “Tentar novamente”; a ação refaz a consulta e permite recuperar sem terminar a sessão. A falha de rede e recuperação para catálogo vazio foram verificadas em Chromium, com transporte de teste e sem criar dados na base da aplicação.
