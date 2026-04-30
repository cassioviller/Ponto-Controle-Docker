import { pool } from "./index";

const SQL_INIT = `
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
  intervalo TEXT,
  total_horas TEXT,
  he_60 TEXT,
  he_100 TEXT,
  atrasos TEXT,
  faltas NUMERIC(3,1) DEFAULT '0',
  observacoes TEXT,
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registros_ponto_func_data
  ON registros_ponto (funcionario_id, data);
`;

export async function runDbInit(): Promise<void> {
  console.log("[db-init] Running CREATE TABLE IF NOT EXISTS...");
  await pool.query(SQL_INIT);
  console.log("[db-init] Schema verified.");
}
