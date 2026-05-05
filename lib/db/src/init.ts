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
  adiantamento NUMERIC(12,2) NOT NULL DEFAULT 0,
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
  justificativa TEXT NOT NULL DEFAULT 'nenhuma',
  horas_justificadas TEXT,
  tipo_dia TEXT NOT NULL DEFAULT 'normal',
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

CREATE TABLE IF NOT EXISTS funcionario_arquivos (
  id SERIAL PRIMARY KEY,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL,
  caminho TEXT NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funcionario_arquivos_func
  ON funcionario_arquivos (funcionario_id);
`;

const SQL_MIGRATIONS = `
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

ALTER TABLE registros_ponto ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

ALTER TABLE registros_ponto ADD COLUMN IF NOT EXISTS saida_almoco TEXT;

ALTER TABLE registros_ponto ADD COLUMN IF NOT EXISTS volta_almoco TEXT;

ALTER TABLE registros_ponto ADD COLUMN IF NOT EXISTS justificativa TEXT NOT NULL DEFAULT 'nenhuma';

ALTER TABLE registros_ponto ADD COLUMN IF NOT EXISTS horas_justificadas TEXT;

ALTER TABLE registros_ponto ADD COLUMN IF NOT EXISTS tipo_dia TEXT NOT NULL DEFAULT 'normal';

CREATE UNIQUE INDEX IF NOT EXISTS funcionarios_empresa_codigo_unique ON funcionarios (empresa_id, codigo) WHERE empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa ON funcionarios (empresa_id);

CREATE INDEX IF NOT EXISTS idx_registros_ponto_empresa ON registros_ponto (empresa_id);

CREATE INDEX IF NOT EXISTS idx_jornadas_padrao_func ON jornadas_padrao (funcionario_id);

ALTER TABLE usuarios ALTER COLUMN empresa_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_super_admin_email_unique ON usuarios (email) WHERE empresa_id IS NULL;

ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS empresa TEXT;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS data_contrato DATE;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS salario NUMERIC(12,2);
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS estado_civil TEXT;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS raca_cor TEXT;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS horario TEXT;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS escolaridade TEXT;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS pis TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'funcionarios'
      AND column_name = 'adiantamento'
      AND data_type = 'boolean'
  ) THEN
    ALTER TABLE funcionarios ALTER COLUMN adiantamento DROP DEFAULT;
    ALTER TABLE funcionarios ALTER COLUMN adiantamento TYPE NUMERIC(12,2) USING 0;
    ALTER TABLE funcionarios ALTER COLUMN adiantamento SET DEFAULT 0;
    ALTER TABLE funcionarios ALTER COLUMN adiantamento SET NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS funcionario_arquivos (
  id SERIAL PRIMARY KEY,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL,
  caminho TEXT NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funcionario_arquivos_func ON funcionario_arquivos (funcionario_id);

-- Vale Alimentação (espelha o booleano de Vale Transporte).
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS vale_alimentacao BOOLEAN NOT NULL DEFAULT FALSE;

-- Escala Quinzenal (Semana A / Semana B)
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS escala_quinzenal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS quinzena_referencia DATE;

ALTER TABLE jornadas_padrao ADD COLUMN IF NOT EXISTS semana SMALLINT NOT NULL DEFAULT 1;

-- Per-employee toggle: false = todo excedente em HE 60% (sem cap de 2h)
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS he_100_acima_2h BOOLEAN NOT NULL DEFAULT TRUE;

-- Substitui o UNIQUE antigo (funcionario_id, dia_semana) pelo novo que inclui semana.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jornadas_padrao_funcionario_id_dia_semana_key'
  ) THEN
    ALTER TABLE jornadas_padrao DROP CONSTRAINT jornadas_padrao_funcionario_id_dia_semana_key;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jornadas_padrao_funcionario_id_dia_semana_semana_key'
  ) THEN
    ALTER TABLE jornadas_padrao
      ADD CONSTRAINT jornadas_padrao_funcionario_id_dia_semana_semana_key
      UNIQUE (funcionario_id, dia_semana, semana);
  END IF;
END $$;
`;

export async function runDbInit(): Promise<void> {
  console.log("[db-init] Running CREATE TABLE IF NOT EXISTS...");
  await pool.query(SQL_INIT);
  console.log("[db-init] Running migrations (ALTER TABLE IF NOT EXISTS)...");
  await pool.query(SQL_MIGRATIONS);
  console.log("[db-init] Schema verified.");
}
