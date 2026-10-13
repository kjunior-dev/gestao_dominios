# Catálogo TLD

Tld contém a identidade única da extensão, apresentação, estado e destaque. TldRegistrar modela explicitamente vários registradores por extensão: capacidades, período mínimo/máximo, prioridade, script IDN e última sincronização. Registrar contém code único, estado e configurationReference para variáveis de ambiente, nunca os valores dos segredos. A pesquisa escolhe uma associação ativa cujo fornecedor está ativo, ordenada por prioridade.

A migração 202610130002_commerce é aditiva: cria Registrar, Tld, TldRegistrar, TldPrice, ExchangeRate, DomainSearchLog, Cart e CartItem, índices, FKs e constraints de períodos, preços e propriedade dos carrinhos. Não modifica ou remove dados da Fase 1. `pnpm db:migrate` utiliza migrate deploy, não reset.

O seed preserva os dados existentes, cria o registrador Openprovider e referências inativas para com/net/org. Não publica custos, câmbio ou preços. O estado ACTIVE do registrador define elegibilidade de routing; OPENPROVIDER_ENABLED controla a conectividade efetiva. Uma extensão manual ativa não prova que está habilitada na conta do fornecedor.

Admin: /admin/tlds (pesquisa, fornecedor, paginação), /admin/tlds/new e /admin/tlds/[id]. Permissão pricing.manage; o backend verifica-a independentemente da UI. As alterações são auditadas. A extensão é imutável após criação, prevenindo mudanças de significado em cotações existentes.

`POST /admin/registrars/openprovider/sync` exige system.manage e consulta o catálogo oficial paginado; novas extensões permanecem inativas. Capacidades recebidas são armazenadas, sem executar operações comerciais. `.cv` não é importado nem ativado para registo nesta fase. Os períodos publicados manualmente devem corresponder às restrições verificadas. `POST /admin/pricing/:id/sync` sincroniza o custo através de GET /tlds/{name} apenas no período mínimo suportado; sem capacidade suportada devolve um erro, sem simular sucesso.
