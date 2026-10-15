# Ciclo de vida das encomendas

A tabela OrderTransition e os logs de auditoria registam as mudanças. As transições estão centralizadas em packages/commerce/src/lifecycle.ts; não há endpoint administrativo para atribuir estados arbitrários.

DRAFT → PENDING_PAYMENT → PAYMENT_PROCESSING → PAID → PROVISIONING → COMPLETED. Falhas e pedidos incertos usam FAILED ou MANUAL_REVIEW. Várias linhas suportam PARTIALLY_COMPLETED. Refunds usam REQUESTED/APPROVED/PROCESSING independentemente dos estados REFUND_PENDING/REFUNDED da encomenda.

PAID exige PaymentEvent verificado e correspondência de montante, moeda e referência. COMPLETED exige todos os registos confirmados. Uma falha de registo não confirma reembolso. Uma falha de pagamento não inicia registo. Um evento pago tardio fica em análise manual.

As consultas do cliente exigem titular da encomenda e associação atual a uma organização ativa; os domínios podem ser consultados pelos membros autorizados da organização. Administradores usam permissões específicas e MFA obrigatória para ADMIN/SUPER_ADMIN.
