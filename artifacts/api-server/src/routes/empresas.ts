import { Router } from "express";
import { db } from "@workspace/db";
import { empresasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Authenticated route: returns the empresas the current user can see.
// - super_admin: all active empresas (used as a switcher).
// - tenant admin: only their own empresa.
router.get("/empresas", async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === "super_admin") {
      const rows = await db.select().from(empresasTable).where(eq(empresasTable.ativo, true));
      res.json(rows);
      return;
    }
    if (!user.empresa_id) {
      res.json([]);
      return;
    }
    const rows = await db.select().from(empresasTable).where(eq(empresasTable.id, user.empresa_id));
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.get("/empresas/:id", async (req, res) => {
  try {
    const user = req.user!;
    const id = parseInt(req.params.id ?? "0", 10);
    if (user.role !== "super_admin" && user.empresa_id !== id) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
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

export default router;
