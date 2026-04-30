import { pgTable, serial, integer, text, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { empresasTable } from "./empresas";

export const feriadosTable = pgTable("feriados", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id")
    .notNull()
    .references(() => empresasTable.id, { onDelete: "cascade" }),
  data: date("data").notNull(),
  descricao: text("descricao").notNull(),
  tipo: text("tipo").notNull().default("nacional"),
});

export const insertFeriadoSchema = createInsertSchema(feriadosTable).omit({
  id: true,
});

export type InsertFeriado = z.infer<typeof insertFeriadoSchema>;
export type Feriado = typeof feriadosTable.$inferSelect;
