FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && useradd -r -u 1001 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app
COPY --from=build --chown=appuser:appuser /app/package.json ./package.json
COPY --from=build --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/dist ./dist
USER appuser
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "process.exit(0)"
CMD ["sh", "-c", "node dist/src/database/migrate.js && node dist/src/index.js"]
