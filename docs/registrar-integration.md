# Camada de registradores

RegistrarsModule disponibiliza RegistrarRegistry e a interface RegistrarProvider. As operações são checkAvailability, getTldPricing e getSupportedTlds; não há registo, compra, transferência ou DNS. Tipos internos não transportam modelos proprietários para a UI. Providers adicionais registam uma implementação explícita no registry; capacidades ausentes lançam CAPABILITY_UNSUPPORTED.

OpenproviderClient limita paths às operações de leitura autorizadas, usa apenas bases HTTPS numa allowlist, recusa redirects, aplica timeout e orçamento Redis partilhado. Até três tentativas com backoff de 100/200 ms para falhas de rede, timeout, manutenção ou HTTP 5xx. HTTP 429 não é repetido: ativa cooldown partilhado, respeitando Retry-After numérico (até 20 minutos). HTTP 401 ou código 196 num pedido com bearer provocam no máximo uma renovação de token; HTTP 403 e códigos explícitos de permissões nunca renovam. No login, 196 significa PROVIDER_LOGIN_REJECTED, enquanto códigos explícitos de credenciais significam PROVIDER_INVALID_CREDENTIALS, mesmo dentro de HTTP 500. Credenciais inválidas não originam ciclos de autenticação. Códigos 50/4007 ativam cooldown; outros erros do envelope são rejeitados sem divulgar desc.

OpenproviderAuth reutiliza tokens cifrados AES-256-GCM em Redis, isolados por ambiente e fingerprint de credenciais. A renovação usa lock distribuído; só o detentor remove o lock. O TTL local conservador é configurável e não é uma afirmação sobre a validade restante no fornecedor. Não existe bearer token no navegador ou PostgreSQL.

Observabilidade: Pino regista fornecedor, operação sem querystring, duração, tentativa, HTTP, código numérico do fornecedor, categoria e código interno. Não regista Authorization, credenciais, tokens, corpo ou desc do fornecedor. O painel mostra configuração, ambiente, última sincronização, erros sanitizados e métricas PostgreSQL.

Qualquer extensão recebida por sincronização começa inativa. A configuração comercial e aprovação administrativa são independentes do catálogo do fornecedor. Mocks são usados apenas nos ficheiros de testes; não existe configuração de produção que substitua uma pesquisa real por respostas de demonstração.

A cache inclui a identidade da chave de cifra, recupera entradas corrompidas e invalida por comparação atómica para preservar substituições concorrentes. O segundo token rejeitado é removido, sem terceira autenticação. Há um orçamento independente de 30 chamadas de login por minuto.
