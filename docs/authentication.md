# Autenticação

Registo cria CUSTOMER ativo e inicia confirmação por token aleatório de 32 bytes. Passwords têm 12–128 caracteres, com Argon2id (64 MiB, três iterações). Email é normalizado.

Login usa cookies `dt_session` em desenvolvimento e `__Host-dt_session` em produção: HttpOnly, SameSite=Lax, Path=/ e Secure em produção. O token aleatório de 256 bits é guardado apenas como SHA-256. Não são usados tokens em localStorage. Sessões expiram após SESSION_TTL_HOURS; logout, revogação individual, logout-all, alteração e recuperação de password invalidam-nas.

`dt_csrf` é um cookie legível que contém um segundo valor aleatório. Nos pedidos autenticados de alteração, o cliente envia `X-CSRF-Token`; a API compara o digest com csrfHash da sessão. Também exige Origin igual a APP_URL, incluindo para login e registo, impedindo login CSRF. CORS aceita apenas APP_URL. Clientes de API devem enviar os mesmos headers.

Os links de confirmação/recuperação usam fragmentos de URL (#token), que não são enviados ao servidor nem em Referer. O frontend remove o fragmento após transferir o valor para o formulário; o token é consumido apenas no corpo de POST. Tokens de recuperação expiram em 30 minutos; confirmação em 24 horas. Só hashes são persistidos; consumo é atómico, único e condicionado à expiração. Novo pedido invalida anteriores. Recuperação devolve a mesma resposta para email conhecido/desconhecido. Rate limiting combina contadores Redis atómicos por IP e limites por email; excesso de tentativas bloqueia login por 15 minutos.

MFA TOTP: segredo cifrado AES-256-GCM com chave externa à base. Setup devolve secret/URI apenas para o utilizador autenticado. Confirm ativa MFA e apresenta oito códigos aleatórios, guardados como hashes. Códigos TOTP e códigos de recuperação são protegidos contra replay. Ativar MFA revoga outras sessões. Administradores recebem sessão restrita até confirmar MFA; todos os endpoints administrativos exigem uma sessão já verificada pelo guard.

Não existe desativação de MFA por API nesta fase; recuperação pode usar códigos de uso único. Recuperar a password não remove MFA. Perda total de fatores exige procedimento operacional futuro com verificação de identidade, sem bypass público.
