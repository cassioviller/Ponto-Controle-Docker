import { Router } from "express";
import { db } from "@workspace/db";
import { jornadasPadraoTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { loadOwnedFuncionario } from "../lib/tenantGuard";
import { backfillRegistrosNormais } from "./funcionarios";

const router = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalizeSemana(raw: unknown): 1 | 2 {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? 1), 10);
  return n === 2 ? 2 : 1;
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
      semana?: number;
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

    // Normaliza campos de horário: trata string vazia como null para que a
    // condição de truthiness em calcFromTipoDia funcione corretamente e dias
    // sem horário configurado (is_folga) não causem fallback inesperado para
    // a jornada diária majoritária.
    const normalizeTime = (v: string | null | undefined): string | null =>
      v ? v.trim() || null : null;

    const result = [];
    for (const j of jornadas) {
      const semana = normalizeSemana(j.semana);
      const entradaPadrao = normalizeTime(j.entrada_padrao);
      const saidaPadrao = normalizeTime(j.saida_padrao);
      const intervaloPadrao = normalizeTime(j.intervalo_padrao);

      const existing = await db
        .select()
        .from(jornadasPadraoTable)
        .where(
          and(
            eq(jornadasPadraoTable.funcionario_id, funcionarioId),
            eq(jornadasPadraoTable.dia_semana, j.dia_semana),
            eq(jornadasPadraoTable.semana, semana),
          )
        );

      if (existing.length > 0 && existing[0]) {
        const [updated] = await db
          .update(jornadasPadraoTable)
          .set({
            entrada_padrao: entradaPadrao,
            saida_padrao: saidaPadrao,
            intervalo_padrao: intervaloPadrao,
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
            semana,
            entrada_padrao: entradaPadrao,
            saida_padrao: saidaPadrao,
            intervalo_padrao: intervaloPadrao,
            is_folga: j.is_folga ?? false,
          })
          .returning();
        result.push(inserted);
      }
    }

    // Limpa jornadas de Semana B órfãs: se nenhuma linha enviada tem semana=2,
    // significa que o funcionário desligou a escala quinzenal (ou nunca teve).
    // Mantê-las criaria estado inconsistente caso a flag seja reativada depois.
    const incomingHasSemanaB = jornadas.some((j) => normalizeSemana(j.semana) === 2);
    if (!incomingHasSemanaB) {
      await db
        .delete(jornadasPadraoTable)
        .where(
          and(
            eq(jornadasPadraoTable.funcionario_id, funcionarioId),
            eq(jornadasPadraoTable.semana, 2),
          ),
        );
    }

    // Recalcula todos os registros 'normal' (ou tipo_dia nulo) do funcionário
    // com a jornada específica de cada dia. Isso garante que registros
    // existentes do sábado — ou qualquer dia com carga horária diferente da
    // maioria — sejam corrigidos imediatamente após a mudança de jornada.
    const registros_recalculados = await backfillRegistrosNormais(funcionario);

    res.json({ jornadas: result, registros_recalculados });
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

export default router;
