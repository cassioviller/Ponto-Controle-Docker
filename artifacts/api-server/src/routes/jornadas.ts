import { Router } from "express";
import { db } from "@workspace/db";
import { jornadasPadraoTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { loadOwnedFuncionario } from "../lib/tenantGuard";

const router = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

router.get("/funcionarios/:id/jornadas", async (req, res) => {
  try {
    const funcionarioId = parseInt(req.params.id ?? "0", 10);
    const empresaId = req.empresaId;

    const funcionario = await loadOwnedFuncionario(funcionarioId, empresaId);
    if (!funcionario) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }

    const rows = await db
      .select()
      .from(jornadasPadraoTable)
      .where(eq(jornadasPadraoTable.funcionario_id, funcionarioId));
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.put("/funcionarios/:id/jornadas", async (req, res) => {
  try {
    const funcionarioId = parseInt(req.params.id ?? "0", 10);
    const empresaId = req.empresaId;

    const funcionario = await loadOwnedFuncionario(funcionarioId, empresaId);
    if (!funcionario) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }

    const jornadas: Array<{
      dia_semana: number;
      empresa_id?: number;
      entrada_padrao?: string | null;
      saida_padrao?: string | null;
      intervalo_padrao?: string | null;
      is_folga?: boolean;
    }> = req.body;

    if (!Array.isArray(jornadas)) {
      res.status(400).json({ error: "Body deve ser um array de jornadas" });
      return;
    }

    // Always derive the jornada's empresa from the (already-tenant-scoped)
    // funcionario rather than trusting any client-supplied value.
    const jornadaEmpresaId = funcionario.empresa_id;

    const result = [];
    for (const j of jornadas) {
      const existing = await db
        .select()
        .from(jornadasPadraoTable)
        .where(
          and(
            eq(jornadasPadraoTable.funcionario_id, funcionarioId),
            eq(jornadasPadraoTable.dia_semana, j.dia_semana),
          )
        );

      if (existing.length > 0 && existing[0]) {
        const [updated] = await db
          .update(jornadasPadraoTable)
          .set({
            entrada_padrao: j.entrada_padrao ?? null,
            saida_padrao: j.saida_padrao ?? null,
            intervalo_padrao: j.intervalo_padrao ?? null,
            is_folga: j.is_folga ?? false,
          })
          .where(eq(jornadasPadraoTable.id, existing[0].id))
          .returning();
        result.push(updated);
      } else {
        if (jornadaEmpresaId == null) {
          res.status(400).json({ error: "Funcionário sem empresa associada — não é possível criar jornada" });
          return;
        }
        const [inserted] = await db
          .insert(jornadasPadraoTable)
          .values({
            funcionario_id: funcionarioId,
            empresa_id: jornadaEmpresaId,
            dia_semana: j.dia_semana,
            entrada_padrao: j.entrada_padrao ?? null,
            saida_padrao: j.saida_padrao ?? null,
            intervalo_padrao: j.intervalo_padrao ?? null,
            is_folga: j.is_folga ?? false,
          })
          .returning();
        result.push(inserted);
      }
    }

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

export default router;
