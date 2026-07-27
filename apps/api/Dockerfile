# API image — build from repo root: docker build -f apps/api/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @jumpstart/shared build \
  && pnpm --filter @jumpstart/database build \
  && pnpm --filter @jumpstart/api build \
  && pnpm --filter @jumpstart/api --prod deploy /out
# `pnpm deploy` assembles /out/node_modules from the pristine store, which drops
# the client `prisma generate` wrote during the database build — regenerate it
# against /out so the engine lands in the runtime node_modules.
RUN cp -r packages/database/prisma /out/prisma \
  && pnpm --filter @jumpstart/database exec prisma generate --schema=/out/prisma/schema.prisma

# Release-time migration job (CI runs this image to completion before each
# deploy): full workspace with the prisma CLI + migrations folder.
FROM build AS migrate
WORKDIR /app/packages/database
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out ./
COPY --from=build /app/apps/api/dist ./dist
# Prisma migrations run at release time (migrate deploy), not at boot
EXPOSE 3001
CMD ["node", "dist/main.js"]
