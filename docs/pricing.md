# Preços comerciais

TldPrice separa supplierCurrency/supplierCostMinor de currency/sellingPriceMinor. Valores mínimos usam PostgreSQL bigint e strings JSON; margens e câmbio usam Decimal. Os números monetários recebidos na wire JSON são preservados como strings antes de JSON.parse, sem passar por IEEE-754. Operações internas usam precisão decimal 60. CVE, EUR e USD têm duas casas decimais; 100 unidades mínimas correspondem a 1,00.

PricingService é a única autoridade para cotações. Primeiro converte o custo total do período para a moeda de venda e soma additionalCostMinor. FIXED acrescenta marginValue em unidades principais da moeda de venda. MARKUP multiplica por (1 + percentagem/100). GROSS_MARGIN divide por (1 - percentagem/100), exigindo margem inferior a 100%. Aplica minimumPriceMinor e arredonda sempre para cima ao múltiplo roundingIncrementMinor. Nunca usa ponto flutuante para dinheiro. O preço total não é novamente multiplicado pelos anos do carrinho.

Cada publicação cria uma versão UUID e desativa a versão anterior do mesmo TLD/registrador/operação/período/moeda sob lock transacional. Auditoria e publicação pertencem à mesma transação. A API administrativa exige pricing.manage. Custos, moeda, modelo de margem e validade são obrigatórios; validade passada e relações inválidas são rejeitadas. TRANSFER e RENEW existem apenas como enumerações futuras, sem operação nesta fase.

Na pesquisa/carrinho, domains/prices fornece o custo específico, incluindo premium e período; aplica-se a política comercial válida desse período. A homepage/tabela mostra o preço standard indicativo do catálogo, sem apresentar custo fornecedor. A pesquisa recalcula a cotação individual. Não existe taxa implícita nem preço fallback.

A expiração da cotação é o mínimo entre QUOTE_TTL_SECONDS, validade da política e validade do câmbio. O carrinho guarda snapshot privado do custo, câmbio, política e preço final. A resposta pública não devolve esse snapshot ou custos. Premium é uma categoria separada da disponibilidade; pode ser cotado e colocado no carrinho, mas não comprado. Não existem pagamentos, impostos fiscais, faturação ou checkout nesta fase.
