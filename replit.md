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
- `funcionarios` — employees (empresa_id, código, nome, cargo, vínculo, situação, adiantamento, transporte, jornada_diária; plus optional CLT fields: empresa, data_contrato, salario, endereço, número, bairro, cidade, cep, estado_civil, raca_cor, horário, escolaridade, pis)
- `funcionario_arquivos` — uploaded documents per employee (funcionario_id FK, nome_arquivo, tipo_arquivo, caminho on disk, criado_em). Files saved under `${UPLOADS_DIR-./uploads}/funcionarios/:id/`.
- `registros_ponto` — daily time records per employee (empresa_id, entrada, saída, saida_almoco, volta_almoco, intervalo, total_horas, HE 60%, HE 100%, atrasos, faltas, observações, justificativa, horas_justificadas)
- `jornadas_padrao` — weekly schedule per employee/day (funcionario_id, empresa_id, dia_semana 0=Sun..6=Sat, entrada_padrao, saida_padrao, intervalo_padrao, is_folga)
- `feriados` — holidays per empresa (data, descricao, tipo)

Migrations run automatically on server start via `lib/db/src/init.ts`.
Seeded with default empresa + admin user; existing employees migrated to empresa_id=1.

## Auto-Calculation Logic

When editing a time record in FolhaIndividual, changing Entrada/Saída/Saída-Almoço/Volta-Almoço triggers `autoCalculate()`:
- Intervalo é derivado automaticamente de `volta_almoco - saida_almoco` (campo Intervalo no modal é readonly).
- If dia de folga (jornada_padrao.is_folga) or domingo/feriado → all worked hours = HE 100%
- Extra hours beyond jornada: first 2h = HE 60%, rest = HE 100%
- No entrada/saída → counted as falta (absence)
- Em registros antigos (sem `saida_almoco`/`volta_almoco`) o `intervalo` salvo é usado como fallback.

## Justificativa de Falta/Atraso

- Cada registro tem o campo `justificativa` com 3 valores: `nenhuma` (padrão), `justificada`, `injustificada`.
- **Justificada** (não desconta): `total_horas` é forçado a igualar a jornada do dia (jornada_padrao do dia ou `funcionario.jornada_diaria` como fallback). HE 60%, HE 100%, atrasos e faltas são zerados; `horas_justificadas` armazena a diferença `jornada - horas_trabalhadas` para fins de relatório.
- **Injustificada** (desconta): mantém o cálculo normal — falta/atraso continua descontado, `horas_justificadas` fica nulo.
- Os endpoints `/api/funcionarios/:id/registros`, `/api/resumo` e `/api/consolidado` agregam `horas_justificadas` (HH:MM) e `dias_justificados` (contagem). A tela "Resumo" exibe coluna "Hrs Just." e a tela de Folha Individual mostra cards "Hrs Just." / "Dias Just." e colunas dedicadas na tabela; o modal de edição traz o seletor "Justificativa".
- A importação Excel preserva a `justificativa` existente da linha (recalculando `horas_justificadas` quando aplicável).

## Datas e formato BR

- Toda data exibida ao usuário é `DD/MM/AAAA` (modal, tabela da Folha, planilha modelo, planilha exportada).
- Internamente o backend continua armazenando `YYYY-MM-DD` (`date` no Postgres).
- O importador Excel aceita `DD/MM/AAAA` (formato preferido) e `YYYY-MM-DD` (retrocompat).
- Helpers: `isoToBrDate`, `brToIsoDate`, `deriveIntervalo` em `artifacts/api-server/src/lib/timeUtils.ts`.

## API Routes

- `GET/POST/PUT /api/empresas` — company management
- `GET/PUT /api/funcionarios/:id/jornadas` — weekly schedule per employee
- `GET/POST/DELETE /api/funcionarios/:id/arquivos[/:arquivoId]` — list / multipart-upload / delete employee documents (allowed: JPG, PNG, PDF, DOCX). `GET .../arquivos/:arquivoId/download` streams the file.
- All existing routes (`/funcionarios`, `/registros`, `/relatorios`) scoped by X-Empresa-Id header

## Deployment

See `DEPLOY.md` for EasyPanel deployment instructions. The `Dockerfile` builds both the API server and React frontend into a single image on port 5987.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
