import { db } from "./index";
import { funcionariosTable, registrosPontoTable } from "./schema";
import { eq } from "drizzle-orm";

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

const REGISTROS_ABRIL_2025_ARIEL = [
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

function calcMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function minToTime(m: number): string {
  return `${String(Math.floor(Math.max(m, 0) / 60)).padStart(2, "0")}:${String(Math.max(m, 0) % 60).padStart(2, "0")}`;
}

export async function runSeed(): Promise<void> {
  const existing = await db.select().from(funcionariosTable);
  if (existing.length > 0) {
    return;
  }

  console.log("[seed] Seeding funcionários...");
  const inserted = await db.insert(funcionariosTable).values(
    FUNCIONARIOS_SEED.map((f) => ({
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
  if (!ariel) return;

  console.log("[seed] Seeding registros de ponto — Abril 2025 (Ariel)...");
  for (const r of REGISTROS_ABRIL_2025_ARIEL) {
    const entradaMin = calcMin(r.entrada);
    const saidaMin = calcMin(r.saida);
    const intervaloMin = calcMin(r.intervalo);
    const totalMin = Math.max(saidaMin - entradaMin - intervaloMin, 0);
    const total_horas = minToTime(totalMin);
    const jornadaMin = 480;
    const extraMin = Math.max(totalMin - jornadaMin, 0);
    const he_60 = minToTime(Math.min(extraMin, 120));
    const he_100 = minToTime(Math.max(extraMin - 120, 0));
    const atrasosMin = totalMin < jornadaMin ? jornadaMin - totalMin : 0;
    const atrasos = minToTime(atrasosMin);

    await db.insert(registrosPontoTable).values({
      funcionario_id: ariel.id,
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

  console.log("[seed] Seed concluído.");
}
