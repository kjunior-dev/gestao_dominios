# Outbox e reconciliação

As filas são payment-confirmation, domain-registration, domain-reconciliation, payment-reconciliation, invoice-generation, email-notifications e refund-processing. CommerceOutbox persiste as intenções na mesma transação que o estado comercial. O worker publica periodicamente com jobId determinístico e só marca publishedAt após aceitação da fila. Uma falha no Redis não perde a intenção.

Os jobs têm três tentativas e backoff exponencial. Chamadas HTTP têm timeout configurável e POST de registo não tem retry automático. Estados UNKNOWN/PENDING/SUBMITTED e pagamentos incertos têm polling periódico; o polling de domínio só consulta estado, sem repetir compra. Consumidores verificam completedAt e estados persistidos. Jobs duplicados são esperados: BullMQ não garante execução exatamente uma vez.

GET /admin/operations apresenta intenções e falhas. POST /admin/operations/:id/retry, com motivo auditado, cria uma nova intenção. Recuperações de domain-registration são convertidas para domain-reconciliation. POST /admin/registrations/:id/resume só admite intenções nunca submetidas (attemptCount=0 e sem identificador externo). Uma operação já enviada nunca pode ser retomada como novo POST.

Os jobs concluídos têm retenção limitada no Redis; as intenções e deduplicações financeiras continuam no PostgreSQL. Não apague PaymentEvent, intenções ou histórico para resolver erros. Contactos/registos sem confirmação inequívoca exigem intervenção no fornecedor, não repetição.
