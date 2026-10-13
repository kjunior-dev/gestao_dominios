# Desenvolvimento

Use Node de `.nvmrc` e pnpm do campo packageManager. O lockfile é a fonte de versões exatas. Antes de `pnpm dev`, gere Prisma e compile contracts/database. Turbo executa API, worker e web em paralelo. A configuração `.env` da raiz é injetada por dotenv-cli. A validação de API/worker falha se configuração ou serviços essenciais não existirem.

Para criar novas migrações em desenvolvimento: `pnpm exec dotenv -e .env -- pnpm --filter @devtrust/database exec prisma migrate dev --name nome`. Nunca use esta operação numa base de produção. `db:migrate` aplica migrações versionadas.

Os componentes UI seguem os padrões source-owned de shadcn: Slot/CVA para Button e Radix para dialogs/dropdowns. Tokens semânticos estão em `apps/web/src/app/globals.css`. Os estilos dark alteram apenas os tokens. FormField liga label e input; estados vazios, erros, skeletons e toasts são partilhados. Persistência do tema pode usar armazenamento de preferência, nunca credenciais.

Adicione casos de uso nos módulos correspondentes, preserve contratos strict e verifique autorização explícita. Não exponha modelos Prisma completos como respostas de User. A documentação de Next.js nesta versão encontra-se no pacote local e deve ser consultada antes de mudanças.
