# RBAC e isolamento

Permissões são uma matriz versionada em `packages/contracts/src/index.ts`, usada pelo backend e pelo frontend; não existem papéis configuráveis por clientes.

| Papel       | Âmbito                                                                         |
| ----------- | ------------------------------------------------------------------------------ |
| SUPER_ADMIN | Todas as permissões; único papel autorizado a alterar papéis globais           |
| ADMIN       | Operações administrativas, exceto system.manage e atribuição de papéis globais |
| SUPPORT     | Leitura de utilizadores, organizações e auditoria                              |
| CUSTOMER    | Apenas conta e organizações às quais pertence                                  |
| OWNER       | Leitura/alteração da organização e gestão dos membros                          |
| MANAGER     | Leitura de organização/membros e futuras operações de domínios/encomendas      |
| MEMBER      | Leitura dos recursos da sua organização                                        |

O guard global exige sessão válida, MFA administrativa, CSRF nas mutações e permissões declaradas. Operações de organização usam AuthorizationService e verificam membership e estado ACTIVE; privilégios globais não dão acesso implícito aos endpoints de cliente de organizações alheias. A administração usa endpoints próprios.

Schemas strict rejeitam campos extra, incluindo globalRole em perfil/registo e status em edição da organização pelo cliente. Não existe endpoint para promover SUPER_ADMIN. Ninguém pode alterar o seu próprio papel/estado pela administração ou alterar SUPER_ADMIN; o bootstrap offline é a única criação do primeiro SUPER_ADMIN. Papéis e estados alterados revogam sessões e geram auditoria na mesma transação.

OWNER não pode despromover ou remover o último OWNER. A remoção revoga imediatamente o acesso aos recursos da organização e é auditada. Atualizar memberId exige correspondência com a organização na URL. A UI oculta controlos de acordo com a matriz; os mesmos limites são sempre aplicados pelo backend.
