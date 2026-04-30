import { Router } from "express";
import { db } from "@workspace/db";
import {
  funcionariosTable,
  insertFuncionarioSchema,
} from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import {
  GetFuncionariosQueryParams,
  GetFuncionarioParams,
  UpdateFuncionarioParams,
  UpdateFuncionarioBody,
  DeleteFuncionarioParams,
  CreateFuncionarioBody,
} from "@workspace/api-zod";

const router = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

router.get("/funcionarios", async (req, res) => {
  try {
    const query = GetFuncionariosQueryParams.parse(req.query);
    const empresaId = req.empresaId;

    let rows = await db.select().from(funcionariosTable);

    if (empresaId) {
      rows = rows.filter((r) => r.empresa_id === empresaId);
    }

    if (query.situacao) {
      rows = rows.filter((r) => r.situacao === query.situacao);
    }
    if (query.vinculo) {
      rows = rows.filter((r) => r.vinculo === query.vinculo);
    }
    if (query.ativo !== undefined) {
      rows = rows.filter((r) => r.ativo === query.ativo);
    }

    res.json(rows);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.post("/funcionarios", async (req, res) => {
  try {
    const body = CreateFuncionarioBody.parse(req.body);
    const empresaId = req.empresaId ?? req.body.empresa_id ?? null;
    const data = insertFuncionarioSchema.parse({ ...body, empresa_id: empresaId });
    const [row] = await db
      .insert(funcionariosTable)
      .values(data)
      .returning();
    res.status(201).json(row);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.get("/funcionarios/:id", async (req, res) => {
  try {
    const { id } = GetFuncionarioParams.parse({ id: Number(req.params.id) });
    const empresaId = req.empresaId;

    const conditions = [eq(funcionariosTable.id, id)];
    if (empresaId) conditions.push(eq(funcionariosTable.empresa_id, empresaId));

    const [row] = await db
      .select()
      .from(funcionariosTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions));

    if (!row) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }
    res.json(row);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.put("/funcionarios/:id", async (req, res) => {
  try {
    const { id } = UpdateFuncionarioParams.parse({ id: Number(req.params.id) });
    const body = UpdateFuncionarioBody.parse(req.body);
    const empresaId = req.empresaId;

    const conditions = [eq(funcionariosTable.id, id)];
    if (empresaId) conditions.push(eq(funcionariosTable.empresa_id, empresaId));

    const [row] = await db
      .update(funcionariosTable)
      .set(body)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }
    res.json(row);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.delete("/funcionarios/:id", async (req, res) => {
  try {
    const { id } = DeleteFuncionarioParams.parse({ id: Number(req.params.id) });
    const empresaId = req.empresaId;

    const conditions = [eq(funcionariosTable.id, id)];
    if (empresaId) conditions.push(eq(funcionariosTable.empresa_id, empresaId));

    const updated = await db
      .update(funcionariosTable)
      .set({ ativo: false, situacao: "Demitido" })
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .returning();
    if (updated.length === 0) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }
    res.json({ message: "Funcionário desativado com sucesso", funcionario: updated[0] });
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

export default router;
