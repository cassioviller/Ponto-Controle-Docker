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

A cada start do container, o servidor executa **antes** de aceitar tráfego:

1. **`runDbInit()`** — emite `CREATE TABLE IF NOT EXISTS` para `funcionarios`, `registros_ponto` e demais tabelas, mais migrações `ALTER TABLE IF NOT EXISTS`. Idempotente.
2. **`runSeed()`** — garante o super admin (ver abaixo), cria a empresa Demo e popula 15 funcionários + registros de Abril/2025 **se** as tabelas estiverem vazias. Idempotente.

### Comportamento em produção (fail-loud)

Em `NODE_ENV=production`, se `runDbInit()` ou `runSeed()` lançarem qualquer erro, o processo **encerra com exit code 1** (sem subir o `app.listen`). Isso é proposital: o EasyPanel vê o crash, mostra o erro nos logs e tenta reiniciar — em vez de subir um servidor sem super admin sem ninguém perceber. Em desenvolvimento (`NODE_ENV !== "production"`) o erro é só logado e o servidor sobe assim mesmo.

### Logs do super admin

O bloco do super admin no seed sempre loga **um** dos três estados:

- `[seed] super admin: criado (<email>)` — não existia, foi inserido com a senha de `SUPER_ADMIN_SENHA`.
- `[seed] super admin: já existia (<email>)` — encontrado pelo e-mail (sem `empresa_id`); a senha **não** é alterada.
- `[seed] super admin: falhou (<email>): <motivo>` — erro de banco/validação. Em produção isso aborta o startup.

Para alterações futuras de schema (ex.: adicionar novas colunas), gere e aplique migrações via Drizzle:
```bash
pnpm --filter @workspace/db run push
```

## Resetar/Criar o Super Admin Manualmente (EasyPanel)

Se precisar redefinir a senha do super admin (ou criar um novo com outro e-mail) sem fazer redeploy, há um comando CLI **idempotente** disponível dentro do container:

- Se já existe um usuário com `empresa_id IS NULL` e o e-mail informado, **atualiza a senha** (bcrypt) e marca `ativo=true`.
- Se não existe, **cria** com `role='super_admin'`, `empresa_id=NULL`, `ativo=true`.

No EasyPanel, abra o terminal do container (ou rode via SSH na máquina host) e execute:

```bash
# Variante 1 — via pnpm (recomendado)
docker exec -it -e SUPER_ADMIN_EMAIL=super@admin.com -e SUPER_ADMIN_SENHA='novaSenhaForte123' \
  <container-id> pnpm --filter @workspace/db run seed:super-admin

# Variante 2 — direto via node (caso pnpm não esteja no PATH do container)
docker exec -it -e SUPER_ADMIN_EMAIL=super@admin.com -e SUPER_ADMIN_SENHA='novaSenhaForte123' \
  <container-id> node /app/artifacts/api-server/dist/bin/seed-super-admin.mjs
```

Saídas esperadas:

```
[seed-super-admin] alvo: super@admin.com
[seed-super-admin] atualizado: senha redefinida e ativo=true (id=2)
```

ou, no caso de criação:

```
[seed-super-admin] alvo: super@admin.com
[seed-super-admin] criado: id=4
```

Em erro, o comando sai com **exit code 1** e imprime `[seed-super-admin] falhou: <motivo>`.

> **Recomendação:** depois do primeiro login, troque a senha do super admin (e mantenha `SUPER_ADMIN_SENHA` no EasyPanel atualizada para refletir a senha atual, caso queira poder rodar o reset novamente no futuro).

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
