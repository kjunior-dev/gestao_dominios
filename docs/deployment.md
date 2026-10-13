# Deploy

A Fase 1 fornece um ambiente executável de desenvolvimento. O Compose não publica a plataforma automaticamente e não é uma configuração de produção.

O Dockerfile tem stages development/production com Node 22.14 e utilizador node no stage final. Para produzir uma aplicação: `docker build -f infrastructure/docker/Dockerfile --target production --build-arg APPLICATION=api -t devtrust-api .` (web/worker equivalentes). O stage final inicia a aplicação selecionada. Para web, `API_INTERNAL_URL` é também um build argument (por omissão `http://api:4000`), pois as rewrites são compiladas; configure-o em build e runtime. O comando final é `pnpm --filter @devtrust/api start` ou equivalente; use processos separados e migrações como tarefa de release.

Em produção: TLS no ingress, APP_URL HTTPS exato, API interna acessível apenas pelo proxy web, PostgreSQL/Redis sem portas públicas, credenciais de infraestrutura fora do repositório, backups restauráveis, retenção de auditoria e observabilidade. Cookies Secure são obrigatórios. O exemplo nginx é apenas um proxy; certificados TLS são fornecidos externamente.

O transporte de notificações de desenvolvimento recusa NODE_ENV=production. É necessário implementar/configurar um transporte transacional de email antes de ativar confirmação/recuperação em produção. Isto é um bloqueio explícito de deploy, não uma simulação de entrega.

Execute migrate deploy uma única vez por release antes de iniciar API/worker. Não use seed em produção. Bootstrap do primeiro administrador com credenciais efémeras, seguido de enrollment MFA. Guarde a chave TOTP num gestor de segredos e prepare rotação com decifragem da versão anterior.

Limitações operacionais: dependências estão presas pelo lockfile, mas exigem avaliação de atualizações antes do lançamento; Docker e workflow CI precisam de execução no respetivo ambiente. Testes locais não substituem testes de carga, restore e revisão de segurança pré produção.

## Aceitação Fase 2

Confirme autenticação, pesquisa, catálogo e preços na conta Openprovider autorizada antes de ativar oferta comercial. Credenciais presentes ou mocks verdes não satisfazem esta condição. Configure taxas verificadas e política de atualização/validade. O worker continua com transporte de correio exclusivamente local e recusa produção: substitua-o por transporte transacional antes de deploy. Não existem compra/checkout ou serviços comerciais de email nesta entrega. Execute também a validação Compose pendente.
