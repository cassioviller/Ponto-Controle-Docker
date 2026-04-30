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

## Multi-Tenant Architecture

- JWT-based authentication (Bearer token in `Authorization` header), token stored in `localStorage`
- `tenantMiddleware` on Express derives `req.empresaId` from the JWT for tenant admins; for `super_admin` it falls back to the `X-Empresa-Id` header (used as a tenant switcher)
- `AuthContext` in the frontend handles login/logout, attaches the JWT via `setAuthTokenGetter`, and sets the active empresa via `setEmpresaId` (custom-fetch in `@workspace/api-client-react`)
- `EmpresaContext` is a thin compatibility shim around `AuthContext`
- Default empresa (id=1) created by seed; existing rows migrated automatically

## Authentication & Roles

- Two roles in `usuarios.role`:
  - `super_admin` — `empresa_id IS NULL`, manages tenants and admin users at `/super-admin`. Can call `POST/GET/PUT /api/admin/empresas` and `POST/GET/PUT /api/admin/usuarios`.
  - `admin` — scoped to one `empresa_id`, sees only their own data. Cannot create empresas or other users.
- `usuarios.empresa_id` is nullable so the super admin row has no empresa.
- Endpoints:
  - `POST /api/auth/login` — body `{ email, senha, empresa_slug? }`. Returns `{ token, usuario, empresa }`.
  - `GET /api/auth/me` — returns the current session user.
  - `/api/admin/*` — super-admin only.
  - All other `/api/*` routes (except `/healthz` and `/auth/*`) require auth.
- `JWT_SECRET` env var is required in production. In development a fixed insecure default is used.
- Seed creates a super admin (`super@admin.com` / `super123`, configurable via `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_SENHA`) and a demo tenant admin (`admin@demo.com` / `admin123`).

## Database

Tables:
- `empresas` — companies (nome, cnpj, plano)
- `usuarios` — admin users per empresa (nome, email, senha_hash, role)
- `funcionarios` — employees (empresa_id, código, nome, cargo, vínculo, situação, adiantamento, transporte, jornada_diária)
- `registros_ponto` — daily time records per employee (empresa_id, entrada, saída, intervalo, total_horas, HE 60%, HE 100%, atrasos, faltas, observações)
- `jornadas_padrao` — weekly schedule per employee/day (funcionario_id, empresa_id, dia_semana 0=Sun..6=Sat, entrada_padrao, saida_padrao, intervalo_padrao, is_folga)
- `feriados` — holidays per empresa (data, descricao, tipo)

Migrations run automatically on server start via `lib/db/src/init.ts`.
Seeded with default empresa + admin user; existing employees migrated to empresa_id=1.

## Auto-Calculation Logic

When editing a time record in FolhaIndividual, changing Entrada or Saída triggers `autoCalculate()`:
- If dia de folga (jornada_padrao.is_folga) or domingo/feriado → all worked hours = HE 100%
- Extra hours beyond jornada: first 2h = HE 60%, rest = HE 100%
- No entrada/saída → counted as falta (absence)
- Intervalo auto-filled from jornada_padrao when not provided

## API Routes

- `GET/POST/PUT /api/empresas` — company management
- `GET/PUT /api/funcionarios/:id/jornadas` — weekly schedule per employee
- All existing routes (`/funcionarios`, `/registros`, `/relatorios`) scoped by X-Empresa-Id header

## Deployment

See `DEPLOY.md` for EasyPanel deployment instructions. The `Dockerfile` builds both the API server and React frontend into a single image on port 5987.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
