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
# the client `prisma generate` wrote during the database build — copy the
# generated client (incl. query engine) into the deployed virtual store.
# The real generated client carries schema.prisma + a query engine; the
# postinstall stub does not — locate by marker, never by store layout.
RUN CLIENT_SRC=$(dirname "$(find /app -type f -path '*/node_modules/.prisma/client/schema.prisma' | head -1)") \
  && PKG_DST=$(find /out/node_modules/.pnpm -maxdepth 1 -type d -name '@prisma+client@*' | head -1) \
  && echo "client src: $CLIENT_SRC -> dst: $PKG_DST" \
  && test -d "$CLIENT_SRC" && test -n "$PKG_DST" \
  && ls "$CLIENT_SRC"/libquery_engine* \
  && rm -rf "$PKG_DST/node_modules/.prisma/client" \
  && mkdir -p "$PKG_DST/node_modules/.prisma" \
  && cp -r "$CLIENT_SRC" "$PKG_DST/node_modules/.prisma/client"

# Release-time migration job (CI runs this image to completion before each
# deploy): full workspace with the prisma CLI + migrations folder.
FROM build AS migrate
WORKDIR /app/packages/database
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Owned by, and run as, the unprivileged `node` user the base image ships.
# Nothing here writes to disk at runtime — attachments live in Postgres and
# migrations run at release time — so read-only ownership is enough.
COPY --from=build --chown=node:node /out ./
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
USER node
# Prisma migrations run at release time (migrate deploy), not at boot
EXPOSE 3001
CMD ["node", "dist/main.js"]
