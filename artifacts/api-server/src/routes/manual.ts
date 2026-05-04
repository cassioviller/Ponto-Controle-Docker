import { Router } from "express";
import { db } from "@workspace/db";
import { empresasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { buildManualPdf } from "../manual/pdf";

const router = Router();

router.get("/manual.pdf", async (req, res) => {
  try {
    const empresaId = req.empresaId ?? null;
    let empresaNome = "Empresa";
    if (empresaId) {
      const [empresa] = await db
        .select({ nome: empresasTable.nome })
        .from(empresasTable)
        .where(eq(empresasTable.id, empresaId));
      if (empresa?.nome) empresaNome = empresa.nome;
    }

    const pdf = await buildManualPdf(empresaNome);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="manual-controle-de-ponto.pdf"',
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(pdf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Falha ao gerar manual: ${msg}` });
  }
});

export default router;
