import bcrypt from "bcryptjs";
import { db, pool } from "./index";
import { funcionariosTable, registrosPontoTable, empresasTable, usuariosTable } from "./schema";
import { and, eq, isNull } from "drizzle-orm";

const FUNCIONARIOS_SEED = [
  { codigo: 1,  nome: "ARIEL RIBEIRO",                   cargo: "",              vinculo: "CLT",          situacao: "Ativo",  adiantamento: false, transporte: false, jornada_diaria: "08:00", ativo: true },
  { codigo: 4,  nome: "IRACY DE SOUZA MENEZES",          cargo: "",              vinculo: "Contribuinte", situacao: "Ativo",  adiantamento: false, transporte: false, jornada_diaria: "08:00", ativo: true },
  { codigo: 11, nome: "FERNANDA MENDES HERREIRO",         cargo: "",              vinculo: "Autonomo",     situacao: "Ativo",  adiantamento: false, transporte: false, jornada_diaria: "08:00", ativo: true },
  { codigo: 13, nome: "FAYANE TALITA DE SOUZA",           cargo: "",              vinculo: "Autonomo",     situacao: "Ativo",  adiantamento: false, transporte: false, jornada_diaria: "08:00", ativo: true },
  { codigo: 15, nome: "MANOEL VICENTE DE QUEIROZ NETO",   cargo: "",              vinculo: "CLT",          situacao: "Ativo",  adiantamento: false, transporte: true,  jornada_diaria: "08:00", ativo: true },
  { codigo: 22, nome: "FERNANDA SANTOS PEREIRA",          cargo: "",              vinculo: "CLT",          situacao: "Ativo",  adiantamento: false, transporte: true,  jornada_diaria: "08:00", ativo: true },
  { codigo: 23, nome: "DEBORA DE OLIVEIRA RAMOS DAVIES",  cargo: "",              vinculo: "CLT",          situacao: "Ativo",  adiantamento: false, transporte: false, jornada_diaria: "08:00", ativo: true },
  { codigo: 24, nome: "EMANUEL FERREIRA SOUZA",           cargo: "Estagiário",    vinculo: "Estagiario",   situacao: "Ativo",  adiantamento: false, transporte: false, jornada_diaria: "06:00", ativo: true },
  { codigo: 25, nome: "MATHEUS HENRIQUE MORAES MAXIMINO", cargo: "Estagiário",    vinculo: "Estagiario",   situacao: "Ativo",  adiantamento: false, transporte: false, jornada_diaria: "06:00", ativo: true },
  { codigo: 26, nome: "MIGUEL ANDERSON DOS SANTOS",       cargo: "",              vinculo: "CLT",          situacao: "Ativo",  adiantamento: false, transporte: true,  jornada_diaria: "08:00", ativo: true },
  { codigo: 27, nome: "GABRIEL MORAES DA SILVA",          cargo: "",              vinculo: "CLT",          situacao: "Ativo",  adiantamento: false, transporte: false, jornada_diaria: "08:00", ativo: true },
  { codigo: 28, nome: "ESTEFANE MENEZES DOS SANTOS",      cargo: "",              vinculo: "CLT",          situacao: "Ativo",  adiantamento: false, transporte: true,  jornada_diaria: "08:00", ativo: true },
  { codigo: 29, nome: "ANA CLARA CAMARGO DE AZEVEDO",     cargo: "",              vinculo: "CLT",          situacao: "Ativo",  adiantamento: false, transporte: false, jornada_diaria: "08:00", ativo: true },
  { codigo: 30, nome: "EXEMPLO COLABORADOR",              cargo: "Operador",      vinculo: "CLT",          situacao: "Ativo",  adiantamento: true,  transporte: true,  jornada_diaria: "08:00", ativo: true },
  { codigo: 31, nome: "EXEMPLO ESTAGIÁRIO",               cargo: "Estagiário",    vinculo: "Estagiario",   situacao: "Ativo",  adiantamento: false, transporte: false, jornada_diaria: "06:00", ativo: true },
] as const;

type SeedReg = { data: string; entrada: string; saida: string; intervalo: string; faltas: string };

const REGISTROS_ABRIL_2025_ARIEL: SeedReg[] = [
  { data: "2025-04-01", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-02", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-03", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-04", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-07", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-08", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-09", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-10", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-11", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-14", entrada: "08:00", saida: "18:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-15", entrada: "08:00", saida: "18:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-16", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-17", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-22", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-23", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-24", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-25", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-28", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-29", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-30", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
];

const REGISTROS_ABRIL_2025_EXEMPLO_CLT: SeedReg[] = [
  { data: "2025-04-01", entrada: "08:00", saida: "17:30", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-02", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-03", entrada: "08:15", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-04", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-07", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-08", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-09", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-10", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-11", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-14", entrada: "08:00", saida: "18:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-15", entrada: "08:00", saida: "18:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-16", entrada: "09:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-22", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-23", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-24", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-25", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-28", entrada: "08:00", saida: "17:00", intervalo: "01:00", faltas: "0" },
  { data: "2025-04-30", entrada: "08:00", saida: "12:00", intervalo: "00:00", faltas: "0.5" },
];

const REGISTROS_ABRIL_2025_EXEMPLO_ESTAGIARIO: SeedReg[] = [
  { data: "2025-04-01", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-02", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-03", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-04", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-07", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-08", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-09", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-10", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-11", entrada: "08:30", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-14", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-22", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-23", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-24", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-25", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-28", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-29", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
  { data: "2025-04-30", entrada: "08:00", saida: "14:00", intervalo: "00:00", faltas: "0" },
];

function calcMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minToTime(m: number): string {
  return `${String(Math.floor(Math.max(m, 0) / 60)).padStart(2, "0")}:${String(Math.max(m, 0) % 60).padStart(2, "0")}`;
}

function isDomingo(dateStr: string): boolean {
  return new Date(dateStr + "T00:00:00").getDay() === 0;
}

async function seedRegistros(funcionarioId: number, empresaId: number, jornadaMin: number, records: SeedReg[]): Promise<void> {
  for (const r of records) {
    const entradaMin = calcMin(r.entrada);
    const saidaMin = calcMin(r.saida);
    const intervaloMin = calcMin(r.intervalo);
    const totalMin = Math.max(saidaMin - entradaMin - intervaloMin, 0);
    const total_horas = minToTime(totalMin);

    let he_60: string;
    let he_100: string;
    let atrasos: string;

    if (isDomingo(r.data)) {
      he_60 = "00:00";
      he_100 = minToTime(totalMin);
      atrasos = "00:00";
    } else {
      const extraMin = Math.max(totalMin - jornadaMin, 0);
      he_60 = minToTime(Math.min(extraMin, 120));
      he_100 = minToTime(Math.max(extraMin - 120, 0));
      atrasos = totalMin < jornadaMin ? minToTime(jornadaMin - totalMin) : "00:00";
    }

    await db.insert(registrosPontoTable).values({
      empresa_id: empresaId,
      funcionario_id: funcionarioId,
      data: r.data,
      entrada: r.entrada,
      saida: r.saida,
      intervalo: r.intervalo,
      total_horas,
      he_60,
      he_100,
      atrasos,
      faltas: r.faltas,
      observacoes: null,
    });
  }
}

export async function runSeed(): Promise<void> {
  let empresaId: number;

  const superAdminEmail = process.env["SUPER_ADMIN_EMAIL"] ?? "super@admin.com";
  const superAdminSenha = process.env["SUPER_ADMIN_SENHA"] ?? "super123";

  const [existingSuper] = await db
    .select()
    .from(usuariosTable)
    .where(and(isNull(usuariosTable.empresa_id), eq(usuariosTable.email, superAdminEmail)));

  if (!existingSuper) {
    console.log(`[seed] Creating super admin (${superAdminEmail})...`);
    const senhaHash = await bcrypt.hash(superAdminSenha, 10);
    await db.insert(usuariosTable).values({
      empresa_id: null,
      nome: "Super Administrador",
      email: superAdminEmail,
      senha_hash: senhaHash,
      role: "super_admin",
      ativo: true,
    });
  }

  const existingEmpresas = await db.select().from(empresasTable);
  if (existingEmpresas.length === 0) {
    console.log("[seed] Creating default empresa...");
    const [empresa] = await db.insert(empresasTable).values({
      nome: "Empresa Demo",
      slug: "demo",
      plano: "basic",
      ativo: true,
    }).returning();
    empresaId = empresa!.id;

    console.log("[seed] Creating default admin user (admin@demo.com / admin123)...");
    const adminHash = await bcrypt.hash("admin123", 10);
    await db.insert(usuariosTable).values({
      empresa_id: empresaId,
      nome: "Administrador",
      email: "admin@demo.com",
      senha_hash: adminHash,
      role: "admin",
      ativo: true,
    });
  } else {
    empresaId = existingEmpresas[0]!.id;

    const [demoAdmin] = await db
      .select()
      .from(usuariosTable)
      .where(and(eq(usuariosTable.empresa_id, empresaId), eq(usuariosTable.email, "admin@demo.com")));

    if (demoAdmin && demoAdmin.senha_hash.startsWith("$2b$10$demo_hash_placeholder")) {
      console.log("[seed] Re-hashing demo admin password...");
      const adminHash = await bcrypt.hash("admin123", 10);
      await db
        .update(usuariosTable)
        .set({ senha_hash: adminHash })
        .where(eq(usuariosTable.id, demoAdmin.id));
    }
  }

  const existing = await db.select().from(funcionariosTable);
  if (existing.length === 0) {
    console.log("[seed] Seeding funcionários (15 total)...");
    const inserted = await db.insert(funcionariosTable).values(
      FUNCIONARIOS_SEED.map((f) => ({
        empresa_id: empresaId,
        codigo: f.codigo,
        nome: f.nome,
        cargo: f.cargo,
        vinculo: f.vinculo,
        situacao: f.situacao,
        adiantamento: f.adiantamento,
        transporte: f.transporte,
        jornada_diaria: f.jornada_diaria,
        ativo: f.ativo,
      }))
    ).returning();

    const ariel = inserted.find((f) => f.codigo === 1);
    const exemploCLT = inserted.find((f) => f.codigo === 30);
    const exemploEstagiario = inserted.find((f) => f.codigo === 31);

    if (ariel) {
      console.log("[seed] Seeding April 2025 registros — ARIEL RIBEIRO...");
      await seedRegistros(ariel.id, empresaId, 480, REGISTROS_ABRIL_2025_ARIEL);
    }

    if (exemploCLT) {
      console.log("[seed] Seeding April 2025 registros — EXEMPLO COLABORADOR...");
      await seedRegistros(exemploCLT.id, empresaId, 480, REGISTROS_ABRIL_2025_EXEMPLO_CLT);
    }

    if (exemploEstagiario) {
      console.log("[seed] Seeding April 2025 registros — EXEMPLO ESTAGIÁRIO...");
      await seedRegistros(exemploEstagiario.id, empresaId, 360, REGISTROS_ABRIL_2025_EXEMPLO_ESTAGIARIO);
    }

    console.log("[seed] Seed concluído: 15 funcionários, 3 funcionários com registros de Abril/2025.");
  } else {
    const withoutEmpresa = existing.filter((f) => f.empresa_id === null);
    if (withoutEmpresa.length > 0) {
      console.log(`[seed] Migrating ${withoutEmpresa.length} existing funcionários to empresa_id=${empresaId}...`);
      await pool.query(
        `UPDATE funcionarios SET empresa_id = $1 WHERE empresa_id IS NULL`,
        [empresaId]
      );
      await pool.query(
        `UPDATE registros_ponto SET empresa_id = $1 WHERE empresa_id IS NULL`,
        [empresaId]
      );
      console.log("[seed] Migration complete.");
    }
  }
}
