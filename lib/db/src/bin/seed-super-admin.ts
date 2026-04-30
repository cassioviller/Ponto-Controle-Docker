import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "../index";
import { usuariosTable } from "../schema";

async function main(): Promise<void> {
  const email = process.env["SUPER_ADMIN_EMAIL"] ?? "super@admin.com";
  const senha = process.env["SUPER_ADMIN_SENHA"] ?? "super123";

  console.log(`[seed-super-admin] alvo: ${email}`);

  const senhaHash = await bcrypt.hash(senha, 10);

  const [existing] = await db
    .select()
    .from(usuariosTable)
    .where(and(isNull(usuariosTable.empresa_id), eq(usuariosTable.email, email)));

  if (existing) {
    await db
      .update(usuariosTable)
      .set({ senha_hash: senhaHash, ativo: true, role: "super_admin" })
      .where(eq(usuariosTable.id, existing.id));
    console.log(`[seed-super-admin] atualizado: senha redefinida e ativo=true (id=${existing.id})`);
  } else {
    const [created] = await db
      .insert(usuariosTable)
      .values({
        empresa_id: null,
        nome: "Super Administrador",
        email,
        senha_hash: senhaHash,
        role: "super_admin",
        ativo: true,
      })
      .returning();
    console.log(`[seed-super-admin] criado: id=${created?.id}`);
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[seed-super-admin] falhou: ${reason}`);
    try {
      await pool.end();
    } catch {
      // ignore
    }
    process.exit(1);
  });
