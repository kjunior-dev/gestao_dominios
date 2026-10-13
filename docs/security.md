# Segurança

Argon2id para passwords; hashes SHA-256 para tokens aleatórios; AES-256-GCM com AAD para segredos TOTP e material de entrega temporário no Redis, com chave externa à base. Tokens de credenciais são guardados apenas como hashes no PostgreSQL. Tokens são 256 bits e de utilização única. Os jobs contêm IDs sem conteúdo secreto; logs Pino registam eventos/IDs, nunca corpos, cookies, tokens ou passwords.

Sessões HttpOnly, Secure em produção, SameSite=Lax e prefixo __Host- em produção. CSRF associa hash a sessão e exige Origin exato nas alterações. CORS fechado à origem configurada. Rate limiting Redis atómico por IP e email, com TTL; não confiar cegamente em X-Forwarded-For. O proxy recomendado não ativa trust proxy indiscriminado. Ao instalar um ingress, configure apenas hops confiáveis para evitar spoofing de IP.

Autorização global e tenancy separados; schemas strict rejeitam injeção de campos; queries Prisma parametrizadas; seleção explícita de campos públicos. Helmet na API e headers de framing/nosniff/referrer no frontend. Links de email usam fragmentos, evitando exposição em access logs e Referer; tokens só são consumidos por POST. O logging de URLs e forwarding do browser no Next dev está desativado. Auditoria usa allowlist rasa de metadata, impedindo segredos/nested payloads.

Credenciais em `.env` não versionado. A chave de 32 bytes hex é gerada com `openssl rand -hex 32`. Não alterar a chave sem plano de migração, pois os segredos já cifrados deixariam de poder ser decifrados. Não usar a caixa de correio local em produção; seus ficheiros contêm links sensíveis e são protegidos com permissões do sistema.

Antes da Fase 2: revisão independente de segurança, configuração de email transacional, CSP adaptada ao Next, política de retenção, atualização de dependências, rotação de chaves, limites de infraestrutura e testes de carga. MFA tem recovery codes; não existe um bypass público ou desativação por reset de password.

## Dependências

Prisma está fixado na correção 6.19.3. Overrides explícitos mantêm effect 3.21.0, deepmerge-ts 8.0.0 e js-yaml 5.4.1 nas versões afetadas. Estas escolhas corrigem os avisos [Effect](https://github.com/advisories/GHSA-38f7-945m-qr2g), [DeepmergeTS](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) e [js-yaml](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm); a compatibilidade é verificada pela geração Prisma, build e suites reais. A CI bloqueia vulnerabilidades de produção com nível high.

O registo marca ESLint 9 e helpers do otplib 12 como deprecated. Mantêm-se por compatibilidade com a stack atual; não foram encontrados avisos de segurança de produção na auditoria final. Planeie a migração dessas ferramentas antes do lançamento em produção, validando as APIs novas e preservando os testes de MFA.

## Integração comercial

A Openprovider é chamada só no backend, em hosts HTTPS autorizados e sem redirects. Tokens de fornecedor são cifrados no Redis; requests/descrições externas não são registados. Falhas de autenticação documentadas dentro de HTTP 500 são permanentes e não repetidas como indisponibilidade. A pesquisa tem limites por IP e orçamento partilhado do fornecedor. Os preços são calculados no servidor com aritmética decimal; schemas strict recusam preço/moeda/cartId/userId enviados pelo cliente. Carrinhos de visitante usam identificadores hashed e CSRF separado, além de Origin. Não há bypass para mocks no runtime comercial: a injeção contratual só existe em testes isolados.

Foi detetado um alias local de configuração chamado `env`, com campos de credenciais. Foi preservado, colocado com permissões 0600 e excluído de Git/Docker. O runtime continua a carregar `.env` pelos comandos documentados; o alias não é carregado automaticamente e não é um ficheiro de exemplo público.
