# Web image — build from repo root: docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @jumpstart/web build

# The unprivileged nginx variant, which runs as uid 101 instead of root. The
# stock nginx:alpine image needs root to bind :80, so it cannot simply take a
# USER line — this image listens on 8080 instead, which is why nginx.conf and
# the compose port mapping say 8080.
#
# Worth knowing: this image is LOCAL ONLY. Production serves the SPA from Azure
# Static Web Apps (see infra/main.bicep and the deploy workflow), so nothing
# here ships. It is fixed anyway because a HIGH finding that everyone has
# learned to scroll past is how the next real one gets missed.
FROM nginxinc/nginx-unprivileged:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
