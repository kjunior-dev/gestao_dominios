# Conversão monetária

A apresentação comercial pública utiliza CVE. Os schemas e ExchangeRateProvider suportam evolução para EUR/USD. EXCHANGE_RATE_PROVIDER=manual seleciona a implementação disponível; valores não suportados falham no arranque. Não existe fornecedor automático nem taxa predefinida nesta fase.

ManualExchangeRateProvider procura a taxa válida mais recente para o par direto baseCurrency/targetCurrency. Não deriva taxas inversas ou triangulares. Conversão na mesma moeda usa a identidade matemática 1, sem alegar que existe uma taxa de mercado. Um par sem taxa válida bloqueia a cotação com erro controlado.

ExchangeRate guarda Decimal(30,16), fonte, fetchedAt e expiresAt. A API exige taxa positiva, par distinto e validade futura. A fonte é identificada como MANUAL. Administradores com pricing.manage adicionam taxas verificadas em /admin/pricing; cada alteração é auditada. Taxas de testes têm fonte CONTRACT TEST ONLY e só existem na base isolada.

O operador deve confirmar a fonte, validade e precisão comercial antes de publicar. Não é efetuada consulta ao banco central ou serviço externo nesta fase. A substituição por um fornecedor automático exige implementar ExchangeRateProvider, validação, cache e rastreabilidade da fonte; o cálculo de preços não precisa de receber conhecimento desse fornecedor.
