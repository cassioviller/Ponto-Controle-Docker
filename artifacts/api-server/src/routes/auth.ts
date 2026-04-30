import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usuariosTable, empresasTable } from "@workspace/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { signToken, requireAuth } from "../middlewares/auth";

const router = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

router.post("/auth/login", async (req, res) => {
  try {
    const { email, senha, empresa_slug } = req.body ?? {};
    if (!email || !senha) {
      res.status(400).json({ error: "email e senha são obrigatórios" });
      return;
    }

    let usuario:
      | typeof usuariosTable.$inferSelect
      | undefined;

    if (empresa_slug) {
      const [empresa] = await db
        .select()
        .from(empresasTable)
        .where(and(eq(empresasTable.slug, empresa_slug), eq(empresasTable.ativo, true)));
      if (!empresa) {
        res.status(401).json({ error: "Credenciais inválidas" });
        return;
      }
      [usuario] = await db
        .select()
        .from(usuariosTable)
        .where(
          and(
            eq(usuariosTable.empresa_id, empresa.id),
            eq(usuariosTable.email, email),
            eq(usuariosTable.ativo, true),
          ),
        );
    } else {
      // Try super admin first (empresa_id IS NULL).
      [usuario] = await db
        .select()
        .from(usuariosTable)
        .where(
          and(
            isNull(usuariosTable.empresa_id),
            eq(usuariosTable.email, email),
            eq(usuariosTable.ativo, true),
          ),
        );

      if (!usuario) {
        // Fall back to a tenant admin uniquely identifiable by email.
        const matches = await db
          .select()
          .from(usuariosTable)
          .where(and(eq(usuariosTable.email, email), eq(usuariosTable.ativo, true)));
        if (matches.length === 1) {
          usuario = matches[0];
        } else if (matches.length > 1) {
          res.status(400).json({ error: "Informe a empresa para este email" });
          return;
        }
      }
    }

    if (!usuario) {
      res.status(401).json({ error: "Credenciais inválidas" });
      return;
    }

    const ok = await bcrypt.compare(senha, usuario.senha_hash);
    if (!ok) {
      res.status(401).json({ error: "Credenciais inválidas" });
      return;
    }

    // For tenant admins, also verify the empresa is still active. (For super
    // admins `empresa_id` is null, so this check is skipped.)  This catches
    // the email-only login fallback above where we matched by email without
    // ever filtering on `empresa.ativo`.
    if (usuario.empresa_id) {
      const [emp] = await db
        .select({ ativo: empresasTable.ativo })
        .from(empresasTable)
        .where(eq(empresasTable.id, usuario.empresa_id));
      if (!emp || !emp.ativo) {
        res.status(401).json({ error: "Credenciais inválidas" });
        return;
      }
    }

    const token = signToken({
      user_id: usuario.id,
      empresa_id: usuario.empresa_id,
      role: usuario.role,
      email: usuario.email,
    });

    let empresaInfo: { id: number; nome: string; slug: string } | null = null;
    if (usuario.empresa_id) {
      const [emp] = await db
        .select({ id: empresasTable.id, nome: empresasTable.nome, slug: empresasTable.slug })
        .from(empresasTable)
        .where(eq(empresasTable.id, usuario.empresa_id));
      empresaInfo = emp ?? null;
    }

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
        empresa_id: usuario.empresa_id,
      },
      empresa: empresaInfo,
    });
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    let empresaInfo: { id: number; nome: string; slug: string } | null = null;
    if (user.empresa_id) {
      const [emp] = await db
        .select({ id: empresasTable.id, nome: empresasTable.nome, slug: empresasTable.slug })
        .from(empresasTable)
        .where(eq(empresasTable.id, user.empresa_id));
      empresaInfo = emp ?? null;
    }
    res.json({
      usuario: {
        id: user.user_id,
        email: user.email,
        role: user.role,
        empresa_id: user.empresa_id,
      },
      empresa: empresaInfo,
    });
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

export default router;
