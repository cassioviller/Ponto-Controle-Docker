import { pgTable, serial, integer, text, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { funcionariosTable } from "./funcionarios";
import { empresasTable } from "./empresas";

export const jornadasPadraoTable = pgTable("jornadas_padrao", {
  id: serial("id").primaryKey(),
  funcionario_id: integer("funcionario_id")
    .notNull()
    .references(() => funcionariosTable.id, { onDelete: "cascade" }),
  empresa_id: integer("empresa_id")
    .notNull()
    .references(() => empresasTable.id, { onDelete: "cascade" }),
  dia_semana: integer("dia_semana").notNull(),
  entrada_padrao: text("entrada_padrao"),
  saida_padrao: text("saida_padrao"),
  intervalo_padrao: text("intervalo_padrao"),
  is_folga: boolean("is_folga").notNull().default(false),
}, (t) => [unique("jornadas_padrao_func_dia_unique").on(t.funcionario_id, t.dia_semana)]);

export const insertJornadaPadraoSchema = createInsertSchema(jornadasPadraoTable).omit({
  id: true,
});

export type InsertJornadaPadrao = z.infer<typeof insertJornadaPadraoSchema>;
export type JornadaPadrao = typeof jornadasPadraoTable.$inferSelect;
