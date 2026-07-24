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

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out ./
COPY --from=build /app/apps/api/dist ./dist
# Prisma migrations run at release time (migrate deploy), not at boot
EXPOSE 3001
CMD ["node", "dist/main.js"]
