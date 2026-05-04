import { pgTable, serial, text, boolean, integer, timestamp, numeric, date, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { empresasTable } from "./empresas";

export const funcionariosTable = pgTable("funcionarios", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id")
    .references(() => empresasTable.id, { onDelete: "cascade" }),
  codigo: integer("codigo").notNull(),
  nome: text("nome").notNull(),
  cargo: text("cargo").notNull().default(""),
  vinculo: text("vinculo").notNull().default("CLT"),
  situacao: text("situacao").notNull().default("Ativo"),
  adiantamento: numeric("adiantamento", { precision: 12, scale: 2 }).notNull().default("0"),
  transporte: boolean("transporte").notNull().default(false),
  jornada_diaria: text("jornada_diaria").notNull().default("08:00"),
  ativo: boolean("ativo").notNull().default(true),
  // Dados do contrato (CLT)
  empresa: text("empresa"),
  data_contrato: date("data_contrato"),
  salario: numeric("salario", { precision: 12, scale: 2 }),
  // Dados pessoais (CLT)
  endereco: text("endereco"),
  numero: text("numero"),
  bairro: text("bairro"),
  cidade: text("cidade"),
  cep: text("cep"),
  estado_civil: text("estado_civil"),
  raca_cor: text("raca_cor"),
  horario: text("horario"),
  escolaridade: text("escolaridade"),
  pis: text("pis"),
  // Escala Quinzenal ("sábado sim, sábado não" — vale para qualquer dia da semana).
  // Quando true, o funcionário possui DUAS jornadas padrão (Semana A=1 e Semana B=2)
  // e a semana de cada data é derivada de `quinzena_referencia`.
  escala_quinzenal: boolean("escala_quinzenal").notNull().default(false),
  // Data que marca o início da Semana A. Toda data cuja semana ISO seja
  // múltiplo par de 7 dias após esta referência cai na Semana A; caso contrário, Semana B.
  quinzena_referencia: date("quinzena_referencia"),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [unique("funcionarios_empresa_codigo_unique").on(t.empresa_id, t.codigo)]);

export const insertFuncionarioSchema = createInsertSchema(funcionariosTable).omit({
  id: true,
  criado_em: true,
});

export type InsertFuncionario = z.infer<typeof insertFuncionarioSchema>;
export type Funcionario = typeof funcionariosTable.$inferSelect;

export const funcionarioArquivosTable = pgTable("funcionario_arquivos", {
  id: serial("id").primaryKey(),
  funcionario_id: integer("funcionario_id")
    .notNull()
    .references(() => funcionariosTable.id, { onDelete: "cascade" }),
  nome_arquivo: text("nome_arquivo").notNull(),
  tipo_arquivo: text("tipo_arquivo").notNull(),
  caminho: text("caminho").notNull(),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
});

export const insertFuncionarioArquivoSchema = createInsertSchema(funcionarioArquivosTable).omit({
  id: true,
  criado_em: true,
});

export type InsertFuncionarioArquivo = z.infer<typeof insertFuncionarioArquivoSchema>;
export type FuncionarioArquivo = typeof funcionarioArquivosTable.$inferSelect;
