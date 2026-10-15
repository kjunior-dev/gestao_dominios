# Preços comerciais

O serviço `PricingService` é a autoridade para cotações. Não existem preços fictícios, câmbio implícito nem margem global. Uma política explícita deve existir para cada TLD, registrador, operação e período. As vendas públicas são em CVE; EUR e USD são também moedas de aquisição. O painel rejeita publicação de venda noutra moeda, evitando políticas que a pesquisa não poderia utilizar.

## Valores e cálculo

`TldPrice` separa `supplierCurrency`/`supplierCostMinor` de `currency`/`sellingPriceMinor`. Dinheiro usa PostgreSQL bigint e strings JSON; margens e câmbio usam Decimal com precisão 60. O parser da Openprovider preserva os números do JSON como strings antes de JSON.parse. CVE, EUR e USD têm duas casas decimais: 100 unidades mínimas = 1,00.

A política converte o custo **total do período** e soma `additionalCostMinor`. `FIXED` acrescenta `marginValue` em unidades principais de CVE; `MARKUP` multiplica por `(1 + margem/100)`; `GROSS_MARGIN` divide por `(1 - margem/100)`, com margem inferior a 100%. Aplica o mínimo e arredonda para cima ao múltiplo de `roundingIncrementMinor`. Custo negativo, custo fracionário em unidades mínimas e câmbio não positivo são rejeitados.

Uma venda manual explícita (`manualSellingPriceMinor`) exige motivo e validade, substitui o resultado da margem apenas para domínios standard, e continua a exigir custo real e câmbio válido na pesquisa. Premium usa o custo específico e a política de margem, ignorando a venda manual standard.

## Openprovider

A integração de produção utiliza `https://api.openprovider.eu/v1`:

- `POST /auth/login`: autenticação; token cifrado em Redis e renovação limitada quando rejeitado.
- `POST /domains/check`, com `with_price: true`: disponibilidade. O preço de pesquisa final é obtido separadamente para confirmar o domínio e período.
- `GET /domains/prices`: custo específico com `domain.name`, `domain.extension`, `operation=create` e `period`; inclui premium. A moeda e custo aplicáveis à conta provêm de `price.reseller`.
- `GET /tlds/{extension}?with_price=true`: custo standard no período mínimo. Para registo prefere `reseller_price` (descontos/promoções da conta), usando `create_price` quando aquele campo não existe. Renovação e transferência usam os seus próprios campos.

Não se multiplica o preço anual para obter vários anos. Se o endpoint de TLD não disponibilizar inequivocamente o período solicitado, a consulta administrativa falha com `CAPABILITY_UNSUPPORTED`; pode configurar-se um custo manual verificado. A pesquisa individual continua a consultar o período exato à API. Períodos fora dos limites do catálogo são rejeitados.

Referências oficiais: [portal e versão](https://developer.openprovider.com/rest-api-documentation.html), [OpenAPI](https://developer.openprovider.com/data/swagger.json), [consulta de preço por domínio/período](https://support.openprovider.eu/hc/en-us/articles/360023776313-3-Domains-API-How-to-retrieve-domain-price).

## Administração

`/admin/pricing` permite consultar o custo antes da primeira publicação, definir margem, mínimo, arredondamento, venda manual e validade, publicar novas versões, ativar/desativar e sincronizar custos. Apresenta origem manual/API, última tentativa, último sucesso e código de erro. A lista inclui versões inativas. A edição preenche o formulário e publica uma nova versão.

Todas as alterações exigem `pricing.manage`, proteção CSRF e sessão administrativa com MFA conforme as regras existentes. Publicação, substituição da versão ativa e auditoria ocorrem na mesma transação e sob lock por TLD/registrador/operação/período/moeda. Sincronizar uma versão inativa não a ativa nem substitui outra política ativa.

Interfaces administrativas adicionais:

- `POST /admin/pricing/supplier-cost`: recebe `tldId`, `registrarId`, `periodYears`, `operation`; devolve custo/moeda e instante da consulta. Não publica política.
- `POST /admin/pricing`: aceita `operation`, `costSource` (`MANUAL`/`API`), `manualSellingPriceMinor` opcional e `changeReason`. A origem API força nova consulta no backend ao publicar; ignora o custo enviado pelo navegador.
- `PATCH /admin/pricing/:id/state`: recebe `isActive`; ativação exige validade e câmbio.
- `POST /admin/pricing/:id/sync`: publica nova versão com custo da API e conserva a política comercial; uma falha conserva o custo anterior e regista o erro.

Registo, renovação e transferência têm políticas independentes. A pesquisa e o carrinho continuam a vender apenas registos; gerir preços das outras operações não executa transferências ou renovações.

## Pesquisa, confirmação e carrinho

Sem política ou câmbio válido, a disponibilidade mantém-se e `quote` é null. Os códigos distinguem política ausente, expirada ou desativada, câmbio ausente/expirado/inválido e erros do fornecedor. A interface mostra **Preço indisponível** e impede a inclusão. As respostas públicas nunca incluem custos nem snapshots internos.

Cotações individuais incluem `quoteToken`: payload público assinado com HMAC-SHA256 e contexto próprio, usando a chave de aplicação existente. Vincula domínio, registrador, estado premium, período, venda, moeda, versão e expiração. Não contém custo de aquisição. A validade é o mínimo entre `QUOTE_TTL_SECONDS`, política e câmbio. Alterar a chave de aplicação invalida as assinaturas anteriores.

O frontend envia `quoteToken` ao adicionar/revalidar. O backend consulta novamente disponibilidade e preço e rejeita divergências ou expiração. Não aceita preços enviados pelo cliente. Para compatibilidade com os clientes standard existentes, uma inclusão sem token continua a obter uma cotação nova exclusivamente no backend; premium exige sempre token e `acceptPremium: true`. Alterações de preço/período de um item existente exigem cotação assinada. O painel de confirmação no carrinho mostra o novo valor antes da atualização.

O carrinho guarda custo, câmbio, política e preço num snapshot privado e a data de validade. Guarda também a aceitação explícita premium. A interface desativa cotações expiradas e o backend volta a verificar expiração dentro da transação. Misturar moedas é bloqueado, incluindo ao associar o carrinho anónimo a uma conta. O checkout revalida disponibilidade, venda, moeda, registrador e premium e exige nova confirmação se qualquer condição mudar. A aceitação premium também é exigida no checkout.

## Configurar o ambiente existente

1. Aplicar `pnpm db:migrate` e regenerar/compilar os pacotes na instalação que vai executar a aplicação.
2. Em `/admin/pricing`, publicar câmbio verificado EUR→CVE (e USD→CVE se necessário), indicando fonte e validade. Não há fornecedor automático de câmbio.
3. Escolher TLD, registrador, operação e período; consultar o custo Openprovider, definir margem e validade e publicar a política. Para períodos sem custo standard suportado, usar custo manual verificado.
4. Confirmar que o TLD e a ligação ao registrador estão ativos. Pesquisar novamente para obter a cotação individual.

Não se criam políticas, taxas ou margens automaticamente. As consultas Openprovider não compram nem registam domínios; as configurações de transações reais existentes permanecem bloqueadas.
