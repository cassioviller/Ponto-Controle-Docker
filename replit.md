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
- `funcionarios` — employees (empresa_id, código, nome, cargo, vínculo, situação, adiantamento [NUMERIC(12,2) em R$, default 0], transporte, jornada_diária, **escala_quinzenal** [bool], **quinzena_referencia** [date]; plus optional CLT fields: empresa, data_contrato, salario, endereço, número, bairro, cidade, cep, estado_civil, raca_cor, horário, escolaridade, pis)
- `funcionario_arquivos` — uploaded documents per employee (funcionario_id FK, nome_arquivo, tipo_arquivo, caminho on disk, criado_em). Files saved under `${UPLOADS_DIR-./uploads}/funcionarios/:id/`.
- `registros_ponto` — daily time records per employee (empresa_id, entrada, saída, saida_almoco, volta_almoco, intervalo, total_horas, HE 60%, HE 100%, atrasos, faltas, observações, justificativa, horas_justificadas)
- `jornadas_padrao` — weekly schedule per employee/day (funcionario_id, empresa_id, dia_semana 0=Sun..6=Sat, **semana** smallint 1=A 2=B, entrada_padrao, saida_padrao, intervalo_padrao, is_folga). UNIQUE em (funcionario_id, dia_semana, semana). Funcionários sem `escala_quinzenal` só têm linhas com semana=1.
- `feriados` — holidays per empresa (data, descricao, tipo)

Migrations run automatically on server start via `lib/db/src/init.ts`.
Seeded with default empresa + admin user; existing employees migrated to empresa_id=1.

## Escala Quinzenal (Semana A / Semana B)

Funcionários com `escala_quinzenal=true` alternam duas Jornadas Padrão (Semana A e Semana B) a cada 7 dias, válido para qualquer dia da semana ("sábado sim, sábado não", etc).

- A semana de cada data é derivada por `computeSemanaForDate(dateStr, quinzena_referencia)` em `artifacts/api-server/src/lib/timeUtils.ts`: diferença em semanas entre as segundas-feiras ISO da data e da referência; par → Semana A, ímpar → Semana B.
- Se `quinzena_referencia` é `null` ou `escala_quinzenal=false`, todas as datas usam Semana A.
- Fallback: se há linha de Semana A para o dia mas não Semana B, usa Semana A.
- Em folga-quinzenal sem horários: tratado como folga (zero faltas/HE).
- Em dia trabalhado quinzenal: horas contam como **normais** (não viram HE), respeitando a jornada da semana correta.
- UI: tela Funcionários → toggle "Escala quinzenal" + date picker "Data de referência (Semana A)" + segunda tabela "Semana B". Validação no save: se quinzenal estiver ON, data de referência é obrigatória.
- PUT `/funcionarios/:id/jornadas` faz upsert por (funcionario_id, dia_semana, semana) e remove linhas órfãs de Semana B quando o array enviado não contém nenhuma linha com semana=2.

## Auto-Calculation Logic

When editing a time record in FolhaIndividual, changing Entrada/Saída/Saída-Almoço/Volta-Almoço triggers `autoCalculate()`:
- Intervalo é derivado automaticamente de `volta_almoco - saida_almoco` (campo Intervalo no modal é readonly).
- If dia de folga (jornada_padrao.is_folga) or domingo/feriado → all worked hours = HE 100%
- Extra hours beyond jornada: first 2h = HE 60%, rest = HE 100%
- No entrada/saída → counted as falta (absence)
- Em registros antigos (sem `saida_almoco`/`volta_almoco`) o `intervalo` salvo é usado como fallback.

## Tipo do Dia (lançamento unificado)

Cada registro tem o campo `tipo_dia` (enum) com 6 valores que determinam todo o cálculo:

| Tipo | Total | HE 60% | HE 100% | Atrasos | Faltas | Hrs Just. |
|---|---|---|---|---|---|---|
| `normal` | trabalhadas | excesso até 2h | excesso > 2h | jornada − trab. | 0 | — |
| `feriado` | jornada padrão | 0 | 0 | 0 | 0 | 00:00 |
| `feriado_trabalhado` | trabalhadas | 0 | trabalhadas | 0 | 0 | 00:00 |
| `falta` | 00:00 | 0 | 0 | 0 | 1 | 00:00 |
| `falta_justificada` | jornada padrão | 0 | 0 | 0 | 0 | jornada − trab. |
| `atraso_justificado` | trabalhadas | excesso até 2h | excesso > 2h | 0 | 0 | 00:00 |

- A regra única vive em `artifacts/api-server/src/lib/timeUtils.ts → calcFromTipoDia()` e é aplicada por POST `/registros`, `/ponto/bater` e `/importar`.
- **Auto-detecção de feriado/domingo**: em `/ponto/bater`, se o registro do dia está com tipo default `normal` mas a data é domingo ou feriado (nacional ou da empresa), o tipo é automaticamente promovido para `feriado_trabalhado` antes do cálculo final.
- Compat legado: campos antigos `justificativa` (`nenhuma`/`justificada`/`injustificada`) e `faltas` são preenchidos por `legacyMirrorFromTipo()` para manter relatórios e queries antigas funcionando. Backfill executado: linhas pré-tipo_dia foram derivadas via heurística. `tipoFromLegacy()` (usado quando o caller envia formato antigo sem `tipo_dia`) infere `falta` para dias úteis sem horas e `feriado`/`feriado_trabalhado` em domingos/feriados.
- O endpoint `/consolidado` retorna `codigo` (do funcionário) por linha + `total_geral`. Cada linha inclui `adiantamento` (number em R$), e `total_geral.adiantamento` é a soma de todos. O contrato é `type: number, format: float`; no banco o valor é armazenado como `NUMERIC(12,2)` (string via Drizzle) e convertido para number na borda da API.

## UI de lançamento

- **Folha Individual (modal)**: dropdown único "Tipo do Dia" + banner explicativo + botões "Preencher horário padrão" (usa `jornada_padrao`) e "Limpar horários". Os campos antigos "Faltas" e "Justificativa" foram removidos. A tabela tem coluna "Tipo" (chip colorido).
- **Excel modelo**: aba "Registros de Ponto" tem 8 colunas (Data, Dia da Semana, Tipo do Dia, Entrada, Saída Almoço, Volta Almoço, Saída, Observações). Coluna "Tipo do Dia" tem dropdown nativo com os 6 valores em pt-BR.
- **Excel exportar folha**: cores por tipo (feriado=amarelo, feriado_trab=âmbar, falta=vermelho, falta_just=verde, atraso_just=azul) sobrepõem as cores de sábado/domingo.

## Datas e formato BR

- Toda data exibida ao usuário é `DD/MM/AAAA` (modal, tabela da Folha, planilha modelo, planilha exportada).
- Internamente o backend continua armazenando `YYYY-MM-DD` (`date` no Postgres).
- O importador Excel aceita `DD/MM/AAAA` (formato preferido) e `YYYY-MM-DD` (retrocompat).
- Helpers: `isoToBrDate`, `brToIsoDate`, `deriveIntervalo` em `artifacts/api-server/src/lib/timeUtils.ts`.

## API Routes

- `GET/POST/PUT /api/empresas` — company management
- `GET/PUT /api/funcionarios/:id/jornadas` — weekly schedule per employee
- `GET/POST/DELETE /api/funcionarios/:id/arquivos[/:arquivoId]` — list / multipart-upload / delete employee documents (allowed: JPG, PNG, PDF, DOCX). `GET .../arquivos/:arquivoId/download` streams the file.
- `GET /api/manual.pdf` — generates the user manual PDF (Portuguese, with screenshots, ~43 pages). Auth-only. Used by the "📘 Baixar Manual" button in the sidebar (`Layout.tsx`). Generated server-side via `pdfkit`; content lives in `artifacts/api-server/src/manual/content.ts` and PDF layout in `artifacts/api-server/src/manual/pdf.ts`. Screenshots live in `artifacts/api-server/src/manual/screenshots/` and can be re-captured by running `node artifacts/api-server/scripts/capture-screenshots.mjs` (uses puppeteer + system chromium at `/nix/store/.../chromium`). pdfkit/fontkit/brotli/@swc/helpers/png-js/linebreak are kept external in `build.mjs` because they don't bundle cleanly via esbuild.
- All existing routes (`/funcionarios`, `/registros`, `/relatorios`) scoped by X-Empresa-Id header

## Deployment

See `DEPLOY.md` for EasyPanel deployment instructions. The `Dockerfile` builds both the API server and React frontend into a single image on port 5987.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
