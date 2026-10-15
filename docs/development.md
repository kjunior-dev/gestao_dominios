# Desenvolvimento

Use Node de `.nvmrc` e pnpm do campo packageManager. O lockfile é a fonte de versões exatas. Antes de `pnpm dev`, gere Prisma e compile contracts/database. Turbo executa API, worker e web em paralelo. A configuração `.env` da raiz é injetada por dotenv-cli. A validação de API/worker falha se configuração ou serviços essenciais não existirem.

Para criar novas migrações em desenvolvimento: `pnpm exec dotenv -e .env -- pnpm --filter @devtrust/database exec prisma migrate dev --name nome`. Nunca use esta operação numa base de produção. `db:migrate` aplica migrações versionadas.

Os componentes UI seguem os padrões source-owned de shadcn: Slot/CVA para Button e Radix para dialogs/dropdowns. Tokens semânticos estão em `apps/web/src/app/globals.css`. Os estilos dark alteram apenas os tokens. FormField liga label e input; estados vazios, erros, skeletons e toasts são partilhados. Persistência do tema pode usar armazenamento de preferência, nunca credenciais.

Adicione casos de uso nos módulos correspondentes, preserve contratos strict e verifique autorização explícita. Não exponha modelos Prisma completos como respostas de User. A documentação de Next.js nesta versão encontra-se no pacote local e deve ser consultada antes de mudanças.

## Openprovider

Configure as variáveis exclusivamente em `.env` ou num gestor de segredos. `pnpm registrar:verify` é um smoke test de autenticação/disponibilidade de leitura; uma falha não deve ser substituída por um provider fictício. Veja [openprovider.md](openprovider.md) para requisitos e a discrepância documental de versões. Não execute integração e E2E em simultâneo usando `.env.test`.

## Erros de arranque

`pnpm dev` verifica a versão de Node e as portas configuradas antes de iniciar os serviços. Use `nvm install` e `nvm use` na raiz para selecionar `.nvmrc` (22.14.0); Node 26 não pertence ao intervalo suportado pelo projeto. Se usa uma configuração de execução do IDE, selecione também Node 22 nessa configuração.

`EADDRINUSE` na porta 3000 ou 4000 indica outra execução ativa. Termine-a com Ctrl+C no terminal original; não execute dois `pnpm dev` para o mesmo projeto. Pode identificar processos com `lsof -nP -iTCP:3000 -iTCP:4000 -sTCP:LISTEN`. Quando o frontend falha, Turbo encerra os outros processos; a mensagem de tsx sobre force killing pode ser consequência desse encerramento. Não apague o lock de Next enquanto houver um servidor ativo.

### Node diferente no IDE

O comando `dev` seleciona um executável Node 22.14+ instalado e coloca a respetiva pasta no início do PATH dos serviços. Assim, uma execução do IDE iniciada com Node 26 pode usar o Node 22 disponível no sistema sem alterar os requisitos da aplicação. A seleção verifica o executável atual, o caminho de Node do npm, o PATH e as localizações Homebrew comuns; nunca descarrega runtimes. Se necessário, defina `DEVTRUST_NODE_PATH` na configuração de execução do IDE. `node scripts/dev.mjs --runtime-check` mostra apenas a versão selecionada e a versão herdada, sem iniciar serviços ou mostrar segredos.

## Comércio e testes isolados

Os packages commerce e registrars são compilados pelo grafo Turbo antes da API/worker. Execute `pnpm db:migrate` após instalar dependências. As credenciais locais anteriores não são sobrescritas pela Fase 3. A configuração financeira é validada no arranque e os padrões mantêm operações reais bloqueadas.

Os testes de integração e E2E exigem nome de base terminado em `_test` e Redis DB 1. Execute-os sequencialmente. Next E2E usa `.next-e2e`; o build pode usar `NEXT_OUTPUT_DIR=.next-build pnpm build` para preservar o seu servidor de desenvolvimento. Não remova locks de uma execução ativa.
