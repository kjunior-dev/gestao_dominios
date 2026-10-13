# Carrinho persistente

GET /api/v1/cart inicializa ou consulta o carrinho. POST /cart/items aceita apenas domainName/registrationYears; PATCH /cart/items/:id aceita apenas registrationYears e também revalida uma cotação no mesmo período. DELETE remove um item próprio; DELETE /cart limpa apenas o carrinho próprio. UUIDs são validados. O frontend não envia preço, moeda, custo, cartId ou userId.

Visitantes recebem um identificador aleatório de 256 bits em cookie HttpOnly (Secure e __Host-dt_cart em produção), SameSite=Lax. PostgreSQL guarda apenas o hash. O cookie dt_cart_csrf e o header X-Cart-CSRF-Token protegem mutações de visitante; Origin também é exigido. Para autenticados aplicam-se a sessão, MFA administrativa e X-CSRF-Token da Fase 1. GET não dispensa a proteção das mutações.

Cart vincula exatamente um userId ou identificador hashed. Não existe endpoint para escolher o dono. Itens possuem constraint única cartId+domainName+operation. Revalidações ignoram o cache de disponibilidade, consultam preço específico e gravam snapshot comercial no backend. quoteExpiresAt não ultrapassa a política/câmbio. O subtotal é a soma exata dos totais por período. Os itens expirados ficam assinalados; o utilizador pode revalidá-los explicitamente. Não há checkout que possa aceitar uma cotação expirada.

No login, o carrinho de visitante é associado à conta transacionalmente. Locks do visitante e utilizador impedem dupla associação concorrente; itens já presentes na conta são preservados. O carrinho antigo fica MERGED, sem itens, e os cookies de visitante são removidos. IDs dos itens podem mudar durante esta associação. Falhas de login não associam o carrinho.

Carrinhos têm validade CART_TTL_HOURS (72 por omissão). Mutações num carrinho expirado devolvem 410; uma leitura cria/reinicializa o carrinho. O worker elimina carrinhos expirados no arranque e de hora a hora. Adições são limitadas a vinte itens por carrinho; o merge pode preservar mais itens já existentes em ambos os carrinhos, mas não aumenta a capacidade de novas adições.

UI: /carrinho e /dashboard/carrinho; remover/limpar pedem confirmação. /dashboard/dominios e /dashboard/encomendas são estados vazios honestos. Um domínio cotado não está comprado ou reservado, mesmo quando a consulta diz AVAILABLE. Premium pode ter cotação individual; a compra premium permanece fora do âmbito.
