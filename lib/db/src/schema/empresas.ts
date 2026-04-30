import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const empresasTable = pgTable("empresas", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  cnpj: text("cnpj"),
  slug: text("slug").notNull().unique(),
  plano: text("plano").notNull().default("basic"),
  ativo: boolean("ativo").notNull().default(true),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
});

export const insertEmpresaSchema = createInsertSchema(empresasTable).omit({
  id: true,
  criado_em: true,
});

export type InsertEmpresa = z.infer<typeof insertEmpresaSchema>;
export type Empresa = typeof empresasTable.$inferSelect;
