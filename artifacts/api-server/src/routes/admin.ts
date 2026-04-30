import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usuariosTable, empresasTable } from "@workspace/db/schema";
import { eq, isNotNull, desc } from "drizzle-orm";
import { requireSuperAdmin } from "../middlewares/auth";

const router = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// All routes here require super admin.
router.use("/admin", requireSuperAdmin);

router.get("/admin/empresas", async (_req, res) => {
  try {
    const rows = await db.select().from(empresasTable).orderBy(desc(empresasTable.criado_em));
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.post("/admin/empresas", async (req, res) => {
  try {
    const { nome, cnpj, slug, plano } = req.body ?? {};
    if (!nome || !slug) {
      res.status(400).json({ error: "nome e slug são obrigatórios" });
      return;
    }
    const [row] = await db
      .insert(empresasTable)
      .values({ nome, cnpj: cnpj ?? null, slug, plano: plano ?? "basic", ativo: true })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.put("/admin/empresas/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    const { nome, cnpj, slug, plano, ativo } = req.body ?? {};
    const [row] = await db
      .update(empresasTable)
      .set({
        ...(nome && { nome }),
        ...(cnpj !== undefined && { cnpj }),
        ...(slug && { slug }),
        ...(plano && { plano }),
        ...(ativo !== undefined && { ativo }),
      })
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

router.get("/admin/usuarios", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: usuariosTable.id,
        empresa_id: usuariosTable.empresa_id,
        nome: usuariosTable.nome,
        email: usuariosTable.email,
        role: usuariosTable.role,
        ativo: usuariosTable.ativo,
        criado_em: usuariosTable.criado_em,
        empresa_nome: empresasTable.nome,
        empresa_slug: empresasTable.slug,
      })
      .from(usuariosTable)
      .leftJoin(empresasTable, eq(usuariosTable.empresa_id, empresasTable.id))
      .where(isNotNull(usuariosTable.empresa_id))
      .orderBy(desc(usuariosTable.criado_em));
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.post("/admin/usuarios", async (req, res) => {
  try {
    const { empresa_id, nome, email, senha, role } = req.body ?? {};
    if (!empresa_id || !nome || !email || !senha) {
      res.status(400).json({ error: "empresa_id, nome, email e senha são obrigatórios" });
      return;
    }
    const empresaIdNum = Number(empresa_id);
    const [empresa] = await db.select().from(empresasTable).where(eq(empresasTable.id, empresaIdNum));
    if (!empresa) {
      res.status(404).json({ error: "Empresa não encontrada" });
      return;
    }
    const senhaHash = await bcrypt.hash(senha, 10);
    const [row] = await db
      .insert(usuariosTable)
      .values({
        empresa_id: empresaIdNum,
        nome,
        email,
        senha_hash: senhaHash,
        role: role ?? "admin",
        ativo: true,
      })
      .returning({
        id: usuariosTable.id,
        empresa_id: usuariosTable.empresa_id,
        nome: usuariosTable.nome,
        email: usuariosTable.email,
        role: usuariosTable.role,
        ativo: usuariosTable.ativo,
        criado_em: usuariosTable.criado_em,
      });
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.put("/admin/usuarios/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    const { nome, email, senha, ativo } = req.body ?? {};
    const updates: Partial<typeof usuariosTable.$inferInsert> = {};
    if (nome) updates.nome = nome;
    if (email) updates.email = email;
    if (ativo !== undefined) updates.ativo = ativo;
    if (senha) updates.senha_hash = await bcrypt.hash(senha, 10);
    const [row] = await db
      .update(usuariosTable)
      .set(updates)
      .where(eq(usuariosTable.id, id))
      .returning({
        id: usuariosTable.id,
        empresa_id: usuariosTable.empresa_id,
        nome: usuariosTable.nome,
        email: usuariosTable.email,
        role: usuariosTable.role,
        ativo: usuariosTable.ativo,
      });
    if (!row) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

export default router;
