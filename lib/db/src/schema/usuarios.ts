import { pgTable, serial, text, boolean, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { empresasTable } from "./empresas";

export const usuariosTable = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id")
    .references(() => empresasTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  email: text("email").notNull(),
  senha_hash: text("senha_hash").notNull(),
  role: text("role").notNull().default("admin"),
  ativo: boolean("ativo").notNull().default(true),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [unique("usuarios_empresa_email_unique").on(t.empresa_id, t.email)]);

export const insertUsuarioSchema = createInsertSchema(usuariosTable).omit({
  id: true,
  criado_em: true,
});

export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuariosTable.$inferSelect;
