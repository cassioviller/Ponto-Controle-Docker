# Deploy — Controle de Ponto (EasyPanel)

## Requisitos

- Docker 20+
- PostgreSQL 16 (pode ser um serviço EasyPanel)
- Variável de ambiente `DATABASE_URL` com a connection string do banco

## Variáveis de Ambiente Necessárias

| Variável            | Exemplo                                           | Descrição                                                |
|---------------------|---------------------------------------------------|----------------------------------------------------------|
| `DATABASE_URL`      | `postgresql://user:pass@host:5432/controle_ponto` | Connection string do PostgreSQL                          |
| `PORT`              | `5987`                                            | Porta do servidor (padrão)                               |
| `NODE_ENV`          | `production`                                      | Ambiente de produção                                     |
| `JWT_SECRET`        | `<segredo aleatório forte>`                       | **Obrigatório em produção.** Assina os tokens JWT do login |
| `SUPER_ADMIN_EMAIL` | `super@admin.com`                                 | (Opcional) E-mail do super admin criado no seed          |
| `SUPER_ADMIN_SENHA` | `super123`                                        | (Opcional) Senha inicial do super admin                  |

## Build e Deploy com Docker

```bash
# Build da imagem
docker build -t controle-ponto:latest .

# Teste local
docker run -p 5987:5987 \
  -e DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
  -e PORT=5987 \
  -e NODE_ENV=production \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  controle-ponto:latest
```

## Configuração no EasyPanel

1. Crie um novo projeto no EasyPanel
2. Adicione um serviço **PostgreSQL** (anote o DATABASE_URL gerado)
3. Adicione um serviço **App** com origem: este repositório
4. Configure as variáveis de ambiente:
   - `DATABASE_URL` = connection string do PostgreSQL
   - `PORT` = `5987`
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = um segredo forte (gere com `openssl rand -hex 32`)
   - (opcional) `SUPER_ADMIN_EMAIL` e `SUPER_ADMIN_SENHA` para definir a credencial inicial do super admin
5. Defina a porta exposta: `5987`
6. Deploy

## Login Inicial

- **Super admin** (gestão de tenants e usuários admin):
  - URL: `/login`
  - E-mail: `super@admin.com` (ou `SUPER_ADMIN_EMAIL`)
  - Senha: `super123` (ou `SUPER_ADMIN_SENHA`) — **troque após o primeiro login**
  - Após o login, é redirecionado para `/super-admin`, onde pode criar empresas (tenants) e usuários admin de cada empresa.
- **Admin de empresa** (acesso ao app de ponto da própria empresa):
  - Criado pelo super admin, ou na empresa Demo: `admin@demo.com` / `admin123`.
  - Cada admin enxerga apenas os dados da sua empresa (isolamento por `X-Empresa-Id` derivado do JWT).

## Banco de Dados — Inicialização Automática

Na primeira inicialização, o servidor executa automaticamente:

1. **`runDbInit()`** — emite `CREATE TABLE IF NOT EXISTS` para `funcionarios`, `registros_ponto` e índices necessários. Idempotente — seguro em deploys subsequentes.
2. **`runSeed()`** — popula 15 funcionários (13 reais + 2 EXEMPLO) e registros de Abril/2025 para 3 funcionários. Idempotente — só roda quando a tabela está vazia.

Para alterações futuras de schema (ex.: adicionar novas colunas), gere e aplique migrações via Drizzle:
```bash
pnpm --filter @workspace/db run push
```

## Arquitetura de Produção

```
Usuário → EasyPanel (proxy reverso)
               ↓
        Node.js (porta 5987)
        ├── /api/...  → Express (API REST)
        └── /...      → React (Vite build estático)
```

O servidor Express serve os arquivos estáticos do frontend React em todas as rotas não-API.

## Servidor servindo o Frontend

Adicione no `artifacts/api-server/src/app.ts` (produção):

```typescript
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Após todas as rotas /api:
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.resolve(__dirname, "../../ponto/dist/public");
  app.use(express.static(frontendPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}
```
