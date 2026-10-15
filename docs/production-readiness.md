# Preparação para produção

Esta entrega não autoriza cobranças ou compras reais. Os padrões são PAYMENTS_MODE=mock, DOMAIN_REGISTRATION_MODE=disabled e LIVE_TRANSACTIONS_ENABLED=false. Mudar NODE_ENV ou inserir credenciais não ativa dinheiro ou registos.

Existe preparação para aprovação dupla: SUPER_ADMIN com MFA pede POST /admin/live-approvals com motivo; outro SUPER_ADMIN com MFA assina POST /admin/live-approvals/:id/approve. O pedido está vinculado à configuração e expira em uma hora. Esta aprovação ainda não habilita o gateway: liveReady=false até existir adaptador real aprovado, políticas e validação de produção. Não há botão público para mudar os modos.

Antes de ativar:

- Contratar e validar gateway (SISP/Vinti4 ou banco), credenciais, callbacks autenticados, conciliação e reembolsos em ambiente oficial de testes.
- Resolver a autorização Openprovider pendente; confirmar saldo, contrato, permissões, limites e diferenças entre APIs de produção e sandbox.
- Verificar os contratos específicos do sandbox antes de definir OPENPROVIDER_SANDBOX_CONTRACT_VERIFIED=true; testar o registo e a reconciliação nesse ambiente com autorização explícita; mocks não certificam essa integração.
- Confirmar regras fiscais, documentos autorizados, termos, privacidade, condições de TLD e política de reembolso.
- Implementar transporte transacional real e validar consentimento/tratamento de dados pessoais.
- Confirmar HTTPS, proxies, CSRF, MFA, RBAC, rotação de chaves, backups restauráveis, retenção, alertas e recuperação de filas.
- Validar Docker num ambiente com daemon disponível e executar a CI completa.
- Vincular aprovação dupla ao adaptador real, restringir credenciais e executar um piloto expressamente autorizado com limites financeiros baixos.

Pendências materiais: gateway real e transferência manual; associação/reconciliação automática de contactos incertos; requisitos específicos de TLD com dados adicionais; sandbox oficial não executado; faturação fiscal e envio real de email; validação Docker indisponível localmente. Operações financeiras reais continuam impossíveis por esta implementação.

Use bases e contas distintas para MOCK, sandbox e produção. A reconciliação verifica o ambiente da encomenda antes de consultar identificadores externos. Handles mock não podem ser reutilizados no sandbox; alterações de ambiente exigem contactos e configuração próprios. Não migre handles opacos entre contas ou bases sem validar a titularidade.
