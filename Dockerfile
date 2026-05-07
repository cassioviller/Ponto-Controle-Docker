# syntax=docker/dockerfile:1
FROM node:20-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.json tsconfig.base.json ./
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server
COPY artifacts/ponto ./artifacts/ponto

FROM base AS deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ENV NODE_ENV=production
RUN pnpm --filter @workspace/api-spec run codegen
RUN PORT=5987 BASE_PATH=/ pnpm --filter @workspace/ponto run build
RUN pnpm --filter @workspace/api-server run build

FROM node:20-slim AS runner

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/lib ./lib
COPY --from=deps /app/artifacts/api-server ./artifacts/api-server
COPY --from=build /app/lib/api-client-react/src/generated ./lib/api-client-react/src/generated
COPY --from=build /app/lib/api-zod/src/generated ./lib/api-zod/src/generated
COPY --from=build /app/artifacts/ponto/dist ./artifacts/ponto/dist
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Create directory for file uploads (persists across restarts if volume-mounted)
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=5987

# Required env vars (must be set at runtime):
#   DATABASE_URL  — PostgreSQL connection string, e.g. postgres://user:pass@host:5432/db
#   JWT_SECRET    — Secret key for signing JWT tokens (min 32 chars recommended)
# Optional:
#   UPLOADS_DIR   — Directory for uploaded files (default: /app/uploads)
#   LOG_LEVEL     — Logging level: trace|debug|info|warn|error (default: info)

EXPOSE 5987

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + process.env.PORT + '/api/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "artifacts/api-server/dist/index.mjs"]
