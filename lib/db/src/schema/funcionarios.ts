import { pgTable, serial, text, boolean, integer, timestamp, unique } from "drizzle-orm/pg-core";
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
  adiantamento: boolean("adiantamento").notNull().default(false),
  transporte: boolean("transporte").notNull().default(false),
  jornada_diaria: text("jornada_diaria").notNull().default("08:00"),
  ativo: boolean("ativo").notNull().default(true),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [unique("funcionarios_empresa_codigo_unique").on(t.empresa_id, t.codigo)]);

export const insertFuncionarioSchema = createInsertSchema(funcionariosTable).omit({
  id: true,
  criado_em: true,
});

export type InsertFuncionario = z.infer<typeof insertFuncionarioSchema>;
export type Funcionario = typeof funcionariosTable.$inferSelect;
