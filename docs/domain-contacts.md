# Contactos de domínios

POST /domain-contacts e GET /domain-contacts?organizationId=UUID exigem sessão e permissões da organização. O schema partilhado valida nome, email, telefone separado em indicativo e número, rua/número, cidade, região, código postal e país. Campos desconhecidos são rejeitados.

Os contactos usados por encomendas são imutáveis para preservar a titularidade e os snapshots. Criar outro contacto permite alterar dados para uma compra futura. O mapeamento RegistrarContactMapping é único por contacto e fornecedor e guarda a intenção antes de criar o handle.

Um resultado incerto de criação de contacto não é repetido; exige verificação no painel do fornecedor. Associação automática de um handle preexistente por critérios pessoais aproximados não está implementada: não se adivinha identidade ou titularidade. Até essa verificação, a operação mantém-se em análise manual. Dados adicionais específicos dos TLDs só podem ser automatizados depois de modelados e validados.

Dados pessoais não entram em logs técnicos, na outbox ou em descrições externas. Não há endpoint público para associar handles de outra organização.
