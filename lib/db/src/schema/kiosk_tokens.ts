import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { empresasTable } from "./empresas";

export const kioskTokensTable = pgTable("kiosk_tokens", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id")
    .notNull()
    .references(() => empresasTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  valid_date: text("valid_date").notNull(),
  criado_em: timestamp("criado_em").notNull().defaultNow(),
});

export type KioskToken = typeof kioskTokensTable.$inferSelect;
