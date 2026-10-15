# Webhooks de pagamentos

POST /api/v1/payments/webhooks/:provider aceita exclusivamente mock nesta implementação. Nest preserva rawBody. Este endpoint é separado da autenticação por cookie/CSRF; os restantes endpoints mantêm Origin e CSRF. Continua limitado por IP no guard e o payload fica limitado a 16 KiB na verificação.

Headers: X-Payment-Timestamp (segundos Unix) e X-Payment-Signature (hex HMAC-SHA256 de timestamp + ponto + bytes originais). A assinatura é comparada em tempo constante. A janela de replay é de 300 segundos. MOCK_WEBHOOK_SECRET é opcional: na ausência, deriva-se uma chave de desenvolvimento da chave de cifra com separação de finalidade. Nenhuma chave é enviada ao navegador.

Payload estrito: eventId, externalPaymentId, orderId, amountMinor (string), currency, status (PAID/DECLINED). Antes da persistência verificam-se referência, ambiente, montante e moeda contra a encomenda. Uma constraint única provider+providerEventId deduplica eventos; reutilização com hash/conteúdo diferente é conflito. Só o payload interno filtrado e o hash são persistidos, sem cabeçalhos ou dados de cartão.

O evento e a outbox são criados na mesma transação. O consumidor bloqueia a encomenda, confirma novamente a correspondência e guarda processedAt. Eventos de recusa posteriores a pagamento confirmado não revertem a confirmação. Pagamentos tardios vão para MANUAL_REVIEW. Um webhook autenticado não é equivalente a um registo de domínio concluído.
