# Faturação interna

BillingProfile guarda dados fiscais por organização; Order guarda snapshot imutável para o documento da encomenda. Invoice é única por encomenda e recebe numeração interna INT-DT-... baseada na referência única da encomenda. O consumidor só gera documento para pagamento confirmado.

GET /invoices e GET /invoices/:id consultam documentos autorizados. GET /invoices/:id/pdf devolve PDF real, com linhas, subtotal, imposto configurado e total. Cabeçalhos impedem cache pública. O PDF indica COMPROVATIVO INTERNO — SEM VALIDADE FISCAL; MOCK/SANDBOX permanecem visíveis. Download e notificação de disponibilidade não equivalem a certificação fiscal.

BILLING_MODE=internal e BILLING_TAX_BASIS_POINTS=0 são valores de desenvolvimento. Não se assumiu IVA ou outra regra fiscal de Cabo Verde. Não há sequenciação fiscal certificada, assinatura fiscal, notas de crédito ou comunicação tributária. A conformidade requer validação jurídica/contabilística e integração autorizada antes de vendas reais.

Emails têm HTML responsivo e texto simples e são escritos apenas na caixa privada de desenvolvimento, sem envio externo. O template inclui links de conta/documentos quando apropriado. GET /admin/notifications/preview/:type, protegido, permite pré-visualização em desenvolvimento. O transporte de produção continua bloqueado até ser configurado um fornecedor transacional real.
