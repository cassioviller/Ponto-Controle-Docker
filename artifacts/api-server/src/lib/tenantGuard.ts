import { db } from "@workspace/db";
import { funcionariosTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Loads a funcionario by ID and verifies that it belongs to the request's
 * empresa.  When `empresaId` is set (i.e. the caller is a tenant admin or a
 * super admin viewing a specific tenant), funcionarios from other empresas are
 * treated as not-found to avoid leaking IDs across tenants.
 *
 * Returns `null` when the funcionario does not exist OR belongs to a different
 * empresa.
 */
export async function loadOwnedFuncionario(
  funcionarioId: number,
  empresaId: number | undefined,
) {
  const conditions = [eq(funcionariosTable.id, funcionarioId)];
  if (empresaId) {
    conditions.push(eq(funcionariosTable.empresa_id, empresaId));
  }
  const [row] = await db
    .select()
    .from(funcionariosTable)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions));
  return row ?? null;
}
