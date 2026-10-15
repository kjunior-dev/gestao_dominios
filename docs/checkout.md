# Checkout

O checkout autenticado resolve o carrinho do utilizador, exige `orders.manage` na organização ativa e um contacto da mesma organização. Rejeita carrinhos vazios, expirados ou cotações expiradas. Consulta novamente disponibilidade e preço sem cache, fora da transação; alterações de preço, fornecedor, moeda ou premium obrigam o cliente a atualizar o carrinho.

O cliente envia contactos, nameservers, versão dos termos, aceitação e chave UUID de idempotência, nunca montantes. O servidor calcula subtotal e imposto com BigInt; taxa em basis points configurada manualmente, arredondamento para cima. Taxa 0 é configuração de desenvolvimento, não uma afirmação fiscal. Taxas adicionais e desconto começam em zero.

Uma transação com locks consultivos revalida autorização e fingerprint do carrinho, guarda a encomenda, linhas, limites de custo, snapshot comercial, dados fiscais e intenções de notificação. Só então consome o carrinho. Repetição da mesma chave devolve a mesma encomenda; um conteúdo diferente devolve conflito.

API: POST /checkout, GET /checkout/config, GET /checkout/:id. Páginas: /checkout, /checkout/confirmacao?order=UUID e /checkout/resultado/[orderId]. A confirmação visual não certifica pagamento nem disponibilidade definitiva.
