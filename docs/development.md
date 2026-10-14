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
