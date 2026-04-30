import { Router } from "express";
import { db } from "@workspace/db";
import {
  funcionariosTable,
  insertFuncionarioSchema,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  GetFuncionariosQueryParams,
  GetFuncionarioParams,
  UpdateFuncionarioParams,
  UpdateFuncionarioBody,
  DeleteFuncionarioParams,
  CreateFuncionarioBody,
} from "@workspace/api-zod";

const router = Router();

router.get("/funcionarios", async (req, res) => {
  try {
    const query = GetFuncionariosQueryParams.parse(req.query);
    let rows = await db.select().from(funcionariosTable);

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
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/funcionarios", async (req, res) => {
  try {
    const body = CreateFuncionarioBody.parse(req.body);
    const data = insertFuncionarioSchema.parse(body);
    const [row] = await db
      .insert(funcionariosTable)
      .values(data)
      .returning();
    res.status(201).json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/funcionarios/:id", async (req, res) => {
  try {
    const { id } = GetFuncionarioParams.parse({ id: Number(req.params.id) });
    const [row] = await db
      .select()
      .from(funcionariosTable)
      .where(eq(funcionariosTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/funcionarios/:id", async (req, res) => {
  try {
    const { id } = UpdateFuncionarioParams.parse({ id: Number(req.params.id) });
    const body = UpdateFuncionarioBody.parse(req.body);
    const [row] = await db
      .update(funcionariosTable)
      .set(body)
      .where(eq(funcionariosTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/funcionarios/:id", async (req, res) => {
  try {
    const { id } = DeleteFuncionarioParams.parse({ id: Number(req.params.id) });
    await db
      .delete(funcionariosTable)
      .where(eq(funcionariosTable.id, id));
    res.json({ message: "Funcionário removido com sucesso" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
