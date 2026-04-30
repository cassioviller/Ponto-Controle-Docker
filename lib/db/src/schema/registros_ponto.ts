import { pgTable, serial, integer, text, boolean, date, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { funcionariosTable } from "./funcionarios";
import { empresasTable } from "./empresas";

export const registrosPontoTable = pgTable("registros_ponto", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id")
    .references(() => empresasTable.id, { onDelete: "cascade" }),
  funcionario_id: integer("funcionario_id")
    .notNull()
    .references(() => funcionariosTable.id, { onDelete: "cascade" }),
  data: date("data").notNull(),
  entrada: text("entrada"),
  saida: text("saida"),
  saida_almoco: text("saida_almoco"),
  volta_almoco: text("volta_almoco"),
  intervalo: text("intervalo"),
  total_horas: text("total_horas"),
  he_60: text("he_60"),
  he_100: text("he_100"),
  atrasos: text("atrasos"),
  faltas: numeric("faltas", { precision: 3, scale: 1 }).default("0"),
  observacoes: text("observacoes"),
  atualizado_em: timestamp("atualizado_em").notNull().defaultNow(),
});

export const insertRegistroPontoSchema = createInsertSchema(registrosPontoTable).omit({
  id: true,
  atualizado_em: true,
});

export type InsertRegistroPonto = z.infer<typeof insertRegistroPontoSchema>;
export type RegistroPonto = typeof registrosPontoTable.$inferSelect;
