FROM node:22.14.0-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @devtrust/contracts build && pnpm --filter @devtrust/database build
FROM base AS development
CMD ["pnpm", "dev"]
FROM base AS production
ARG APPLICATION
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
RUN pnpm --filter @devtrust/${APPLICATION} build
ENV NODE_ENV=production
ENV APPLICATION=${APPLICATION}
RUN chown -R node:node /app/apps
USER node
CMD ["sh", "-c", "exec pnpm --filter @devtrust/${APPLICATION} start"]
