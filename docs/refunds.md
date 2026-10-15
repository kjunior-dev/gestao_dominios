# Reembolsos

POST /refunds solicita análise; GET /refunds/:id consulta apenas pedidos do titular autorizado. Idempotência é por pagamento/chave UUID. Uma transação bloqueia a encomenda e reserva o total de pedidos não rejeitados; montantes negativos, duplicação conflitante e excesso de saldo são recusados.

POST /admin/refunds/:id/decision exige refunds.approve e MFA administrativa. O operador deve ser diferente do solicitante; a decisão e justificação ficam auditadas. O mock executa a devolução na fila refund-processing com referência determinística. Só o resultado confirmado marca COMPLETED; suportam-se montantes parciais e estado PARTIALLY_REFUNDED.

Registos concluídos, submetidos, pendentes ou desconhecidos bloqueiam aprovação automática. Condições comerciais de domínios efetivamente registados exigem processo próprio antes de habilitar devolução. O gateway mock não movimenta fundos; não existe reembolso bancário manual ou adaptador real habilitado. Resultado inconclusivo fica UNKNOWN para intervenção, sem prometer devolução.

Os pedidos e estados de reembolso aparecem no detalhe da encomenda, junto ao pagamento, com montante, moeda e motivo. Um reembolso parcial mantém a encomenda em análise manual enquanto o valor restante e o registo não estiverem resolvidos.

A aprovação também consulta a intenção de registo: MANUAL_REVIEW após um POST incerto não torna o pagamento automaticamente reembolsável. Tentativas submetidas sem rejeição definitiva continuam bloqueadas até confirmação do resultado.
