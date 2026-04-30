import { Router } from "express";
import { db } from "@workspace/db";
import { empresasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

router.get("/empresas", async (_req, res) => {
  try {
    const rows = await db.select().from(empresasTable).where(eq(empresasTable.ativo, true));
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.get("/empresas/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    const [row] = await db.select().from(empresasTable).where(eq(empresasTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Empresa não encontrada" });
      return;
    }
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.post("/empresas", async (req, res) => {
  try {
    const { nome, cnpj, slug, plano } = req.body;
    if (!nome || !slug) {
      res.status(400).json({ error: "nome e slug são obrigatórios" });
      return;
    }
    const [row] = await db.insert(empresasTable).values({ nome, cnpj, slug, plano: plano ?? "basic", ativo: true }).returning();
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.put("/empresas/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    const { nome, cnpj, slug, plano, ativo } = req.body;
    const [row] = await db
      .update(empresasTable)
      .set({ ...(nome && { nome }), ...(cnpj !== undefined && { cnpj }), ...(slug && { slug }), ...(plano && { plano }), ...(ativo !== undefined && { ativo }) })
      .where(eq(empresasTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Empresa não encontrada" });
      return;
    }
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

export default router;
