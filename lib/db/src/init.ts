import { pool } from "./index";

const SQL_INIT = `
CREATE TABLE IF NOT EXISTS empresas (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  slug TEXT NOT NULL UNIQUE,
  plano TEXT NOT NULL DEFAULT 'basic',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, email)
);

CREATE TABLE IF NOT EXISTS funcionarios (
  id SERIAL PRIMARY KEY,
  codigo INTEGER NOT NULL,
  nome TEXT NOT NULL,
  cargo TEXT NOT NULL DEFAULT '',
  vinculo TEXT NOT NULL DEFAULT 'CLT',
  situacao TEXT NOT NULL DEFAULT 'Ativo',
  adiantamento BOOLEAN NOT NULL DEFAULT FALSE,
  transporte BOOLEAN NOT NULL DEFAULT FALSE,
  jornada_diaria TEXT NOT NULL DEFAULT '08:00',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registros_ponto (
  id SERIAL PRIMARY KEY,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  entrada TEXT,
  saida TEXT,
  saida_almoco TEXT,
  volta_almoco TEXT,
  intervalo TEXT,
  total_horas TEXT,
  he_60 TEXT,
  he_100 TEXT,
  atrasos TEXT,
  faltas NUMERIC(3,1) DEFAULT '0',
  observacoes TEXT,
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jornadas_padrao (
  id SERIAL PRIMARY KEY,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL,
  entrada_padrao TEXT,
  saida_padrao TEXT,
  intervalo_padrao TEXT,
  is_folga BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (funcionario_id, dia_semana)
);

CREATE TABLE IF NOT EXISTS feriados (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nacional'
);

CREATE INDEX IF NOT EXISTS idx_registros_ponto_func_data
  ON registros_ponto (funcionario_id, data);
`;

const SQL_MIGRATIONS = `
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

ALTER TABLE registros_ponto ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

ALTER TABLE registros_ponto ADD COLUMN IF NOT EXISTS saida_almoco TEXT;

ALTER TABLE registros_ponto ADD COLUMN IF NOT EXISTS volta_almoco TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS funcionarios_empresa_codigo_unique ON funcionarios (empresa_id, codigo) WHERE empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa ON funcionarios (empresa_id);

CREATE INDEX IF NOT EXISTS idx_registros_ponto_empresa ON registros_ponto (empresa_id);

CREATE INDEX IF NOT EXISTS idx_jornadas_padrao_func ON jornadas_padrao (funcionario_id);

ALTER TABLE usuarios ALTER COLUMN empresa_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_super_admin_email_unique ON usuarios (email) WHERE empresa_id IS NULL;
`;

export async function runDbInit(): Promise<void> {
  console.log("[db-init] Running CREATE TABLE IF NOT EXISTS...");
  await pool.query(SQL_INIT);
  console.log("[db-init] Running migrations (ALTER TABLE IF NOT EXISTS)...");
  await pool.query(SQL_MIGRATIONS);
  console.log("[db-init] Schema verified.");
}
