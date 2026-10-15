# Pagamentos

`PaymentProvider` separa criação, consulta, reembolso e autenticação de webhooks. Apenas `MockPaymentProvider` está ativo. Referências mock são determinísticas, estados persistidos e eventos não movimentam dinheiro. O simulador exige sessão, CSRF, titular da encomenda e ambiente MOCK; é recusado em produção.

PAYMENTS_MODE=mock é o padrão; disabled bloqueia novos pagamentos. LIVE_TRANSACTIONS_ENABLED=false é independente de NODE_ENV e das credenciais Openprovider. Não existe adaptador de cobrança real aprovado; flags e aprovações, isoladamente, nunca ativam transações reais.

API: POST /payments {orderId,provider:mock}, GET /payments, GET /payments/:id e POST /payments/:id/mock-confirm {outcome:PAID|DECLINED}. O último endpoint é apenas simulação identificada. Uma confirmação produz PaymentEvent, processado na fila payment-confirmation. Nunca se utiliza success=true do browser.

A SISP publica documentação de pagamentos Vinti4 com envio de formulário e autenticação da resposta por fingerprint: [documentação Node](https://www.vinti4.cv/documentation.aspx?id=682), [adesão](https://www.vinti4.cv/web.aspx). Faltam contrato, terminal, credenciais, condições operacionais e confirmação do ambiente de testes; nenhum endpoint de cobrança foi inventado ou executado. A futura integração deve usar o contrato oficial contratado, sem armazenar cartão ou CVV. Transferência e confirmação bancária manual não estão habilitadas nesta entrega.
