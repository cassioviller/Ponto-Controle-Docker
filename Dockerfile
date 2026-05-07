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
COPY --from=deps /app/artifacts ./artifacts
COPY --from=build /app/lib/api-client-react/src/generated ./lib/api-client-react/src/generated
COPY --from=build /app/lib/api-zod/src/generated ./lib/api-zod/src/generated
COPY --from=build /app/artifacts/ponto/dist ./artifacts/ponto/dist
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

ENV NODE_ENV=production
ENV PORT=5987

EXPOSE 5987

CMD ["node", "artifacts/api-server/dist/index.mjs"]
