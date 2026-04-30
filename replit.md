# Controle de Ponto

## Overview

Brazilian employee time & attendance (ponto eletrônico) system built as a pnpm monorepo. All UI/content is in Portuguese (pt-BR). No authentication.

## Product Features

- **Resumo Geral** — all employees in one view, with month selector and filters (situação, vínculo)
- **Consolidado Mensal** — summary by employee with total row
- **Folha Individual** — day-by-day calendar per employee, with inline editing, weekend highlighting, Excel export/import
- **Bater Ponto** — clock-in/out screen with live clock
- **Gestão de Funcionários** — full CRUD for employees
- **Excel model download** — template file for importing records
- **Excel import** — import a month's records from .xlsx file

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS
- **Routing**: Wouter
- **Excel**: ExcelJS

## Workspace Structure

```
artifacts/
  api-server/     — Express API server (port 8080 in dev)
  ponto/          — React + Vite frontend (port 22875 in dev)
lib/
  api-client-react/  — Orval-generated React Query hooks
  api-zod/           — Orval-generated Zod schemas
  api-spec/          — OpenAPI YAML spec (source of truth)
  db/                — Drizzle ORM schema + migrations
```

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Database

Tables:
- `funcionarios` — employees (código, nome, cargo, vínculo, situação, adiantamento, transporte, jornada_diária)
- `registros_ponto` — daily time records per employee (entrada, saída, intervalo, total_horas, HE 60%, HE 100%, atrasos, faltas, observações)

Seeded with 13 employees and example records for April 2025.

## Deployment

See `DEPLOY.md` for EasyPanel deployment instructions. The `Dockerfile` builds both the API server and React frontend into a single image on port 5987.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
