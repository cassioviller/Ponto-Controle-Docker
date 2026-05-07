import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { kioskTokensTable, registrosPontoTable, funcionariosTable, empresasTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  getCurrentDateStrBR,
  getCurrentTimeStr,
  deriveIntervalo,
  calcFromTipoDia,
  legacyMirrorFromTipo,
  isTipoDia,
  isDomFeriado,
} from "../lib/timeUtils";
import { getJornadaDia, isFeriadoEmpresa } from "./registros";

const router = Router();

function generateToken(): string {
  return randomBytes(9).toString("base64url");
}

function maskToken(token: string): string {
  return token.slice(0, -4) + "****";
}

function getExpiresAtBR(validDate: string): string {
  const [y, m, d] = validDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0)).toISOString();
}

function buildTokenResponse(row: typeof kioskTokensTable.$inferSelect) {
  return {
    token: row.token,
    valid_date: row.valid_date,
    criado_em: row.criado_em,
    url_path: `/kiosk/${row.token}`,
    expires_at: getExpiresAtBR(row.valid_date),
  };
}

async function getOrCreateTodayToken(empresaId: number): Promise<typeof kioskTokensTable.$inferSelect> {
  const today = getCurrentDateStrBR();
  const token = generateToken();
  await db
    .insert(kioskTokensTable)
    .values({ empresa_id: empresaId, token, valid_date: today })
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(kioskTokensTable)
    .where(and(eq(kioskTokensTable.empresa_id, empresaId), eq(kioskTokensTable.valid_date, today)));
  const row = rows[0]!;
  console.log(`[kiosk] Token for empresa ${empresaId} date=${today} token=${maskToken(row.token)}`);
  return row;
}

async function resolveToken(token: string): Promise<(typeof kioskTokensTable.$inferSelect) | null> {
  const today = getCurrentDateStrBR();
  const rows = await db.select().from(kioskTokensTable).where(eq(kioskTokensTable.token, token));
  const row = rows[0] ?? null;
  if (!row) return null;
  if (row.valid_date !== today) return null;
  return row;
}

router.get("/admin/today", requireAuth, async (req: Request, res: Response) => {
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa não identificada" });
    return;
  }
  try {
    const row = await getOrCreateTodayToken(empresaId);
    res.json(buildTokenResponse(row));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/admin/rotate", requireAuth, async (req: Request, res: Response) => {
  const empresaId = req.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: "Empresa não identificada" });
    return;
  }
  try {
    const today = getCurrentDateStrBR();
    await db.delete(kioskTokensTable).where(and(eq(kioskTokensTable.empresa_id, empresaId), eq(kioskTokensTable.valid_date, today)));
    const newToken = generateToken();
    const [created] = await db.insert(kioskTokensTable).values({ empresa_id: empresaId, token: newToken, valid_date: today }).returning();
    console.log(`[kiosk] Rotated token for empresa ${empresaId} date=${today} token=${maskToken(newToken)}`);
    res.json(buildTokenResponse(created!));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/:token/hoje", async (req: Request, res: Response) => {
  const token = String(req.params["token"] ?? "");
  const funcionarioId = parseInt(String(req.query["funcionario_id"] ?? ""), 10);
  if (!funcionarioId || isNaN(funcionarioId)) {
    res.status(400).json({ error: "funcionario_id é obrigatório" });
    return;
  }
  try {
    const row = await resolveToken(token);
    if (!row) {
      res.status(410).json({ error: "Link expirado — peça o novo link de hoje ao seu gestor." });
      return;
    }
    const today = getCurrentDateStrBR();
    const regs = await db
      .select()
      .from(registrosPontoTable)
      .where(and(eq(registrosPontoTable.funcionario_id, funcionarioId), eq(registrosPontoTable.data, today)));
    const reg = regs[0] ?? null;
    const funcRows = await db.select({ empresa_id: funcionariosTable.empresa_id }).from(funcionariosTable).where(eq(funcionariosTable.id, funcionarioId));
    if (!funcRows[0] || funcRows[0].empresa_id !== row.empresa_id) {
      res.status(403).json({ error: "Funcionário não pertence a esta empresa" });
      return;
    }
    res.json({
      entrada: reg?.entrada ?? null,
      saida_almoco: reg?.saida_almoco ?? null,
      volta_almoco: reg?.volta_almoco ?? null,
      saida: reg?.saida ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/:token", async (req: Request, res: Response) => {
  const token = String(req.params["token"] ?? "");
  try {
    const row = await resolveToken(token);
    if (!row) {
      res.status(410).json({ error: "Link expirado — peça o novo link de hoje ao seu gestor." });
      return;
    }
    const empresa = await db.select({ nome: empresasTable.nome }).from(empresasTable).where(eq(empresasTable.id, row.empresa_id));
    const funcionarios = await db
      .select({ id: funcionariosTable.id, nome: funcionariosTable.nome, cargo: funcionariosTable.cargo })
      .from(funcionariosTable)
      .where(and(eq(funcionariosTable.empresa_id, row.empresa_id), eq(funcionariosTable.ativo, true)));

    res.json({
      empresa: { nome: empresa[0]?.nome ?? "" },
      funcionarios,
      valid_date: row.valid_date,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const TIPOS_VALIDOS = ["entrada", "saida_almoco", "volta_almoco", "saida"] as const;
type TipoBatida = typeof TIPOS_VALIDOS[number];

function parseBaterBody(raw: unknown): { funcionario_id: number; tipo: TipoBatida } {
  if (!raw || typeof raw !== "object") throw new Error("Corpo inválido");
  const b = raw as Record<string, unknown>;
  const funcionario_id = Number(b["funcionario_id"]);
  if (!Number.isInteger(funcionario_id) || funcionario_id <= 0) throw new Error("funcionario_id inválido");
  const tipo = b["tipo"] as string;
  if (!TIPOS_VALIDOS.includes(tipo as TipoBatida)) throw new Error("tipo inválido");
  return { funcionario_id, tipo: tipo as TipoBatida };
}

router.post("/:token/bater", async (req: Request, res: Response) => {
  const token = String(req.params["token"] ?? "");
  try {
    const row = await resolveToken(token);
    if (!row) {
      res.status(410).json({ error: "Link expirado — peça o novo link de hoje ao seu gestor." });
      return;
    }
    const body = parseBaterBody(req.body);

    const funcRows = await db
      .select()
      .from(funcionariosTable)
      .where(and(eq(funcionariosTable.id, body.funcionario_id), eq(funcionariosTable.empresa_id, row.empresa_id)));
    const funcionario = funcRows[0] ?? null;
    if (!funcionario) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }

    const horario = getCurrentTimeStr();
    const data = getCurrentDateStrBR();

    const existing = await db
      .select()
      .from(registrosPontoTable)
      .where(and(eq(registrosPontoTable.funcionario_id, body.funcionario_id), eq(registrosPontoTable.data, data)));

    const prevReg = existing[0] ?? null;
    const has = {
      entrada: !!prevReg?.entrada,
      saida_almoco: !!prevReg?.saida_almoco,
      volta_almoco: !!prevReg?.volta_almoco,
      saida: !!prevReg?.saida,
    };

    if (has.saida) { res.status(400).json({ error: "Saída do dia já foi registrada" }); return; }

    if (body.tipo === "entrada") {
      if (has.entrada) { res.status(400).json({ error: "Entrada já registrada hoje" }); return; }
    } else if (body.tipo === "saida_almoco") {
      if (!has.entrada) { res.status(400).json({ error: "Registre a Entrada antes da Saída do Intervalo" }); return; }
      if (has.saida_almoco) { res.status(400).json({ error: "Saída do Intervalo já registrada hoje" }); return; }
    } else if (body.tipo === "volta_almoco") {
      if (!has.entrada) { res.status(400).json({ error: "Registre a Entrada antes da Volta do Intervalo" }); return; }
      if (!has.saida_almoco) { res.status(400).json({ error: "Registre a Saída do Intervalo antes da Volta" }); return; }
      if (has.volta_almoco) { res.status(400).json({ error: "Volta do Intervalo já registrada hoje" }); return; }
    } else if (body.tipo === "saida") {
      if (!has.entrada) { res.status(400).json({ error: "Registre a Entrada antes da Saída" }); return; }
      if (!has.saida_almoco) { res.status(400).json({ error: "Registre a Saída do Intervalo antes da Saída" }); return; }
      if (!has.volta_almoco) { res.status(400).json({ error: "Registre a Volta do Intervalo antes da Saída" }); return; }
    }

    let dbRow;
    const empresaId = row.empresa_id;

    if (!prevReg) {
      [dbRow] = await db
        .insert(registrosPontoTable)
        .values({
          empresa_id: empresaId,
          funcionario_id: body.funcionario_id,
          data,
          entrada: body.tipo === "entrada" ? horario : null,
          saida: body.tipo === "saida" ? horario : null,
          saida_almoco: body.tipo === "saida_almoco" ? horario : null,
          volta_almoco: body.tipo === "volta_almoco" ? horario : null,
        })
        .returning();
    } else if (body.tipo === "entrada") {
      [dbRow] = await db.update(registrosPontoTable).set({ entrada: horario, atualizado_em: new Date() }).where(eq(registrosPontoTable.id, prevReg.id)).returning();
    } else if (body.tipo === "saida_almoco") {
      [dbRow] = await db.update(registrosPontoTable).set({ saida_almoco: horario, atualizado_em: new Date() }).where(eq(registrosPontoTable.id, prevReg.id)).returning();
    } else if (body.tipo === "volta_almoco") {
      const intervaloDerivado = deriveIntervalo(prevReg.saida_almoco, horario);
      [dbRow] = await db.update(registrosPontoTable).set({ volta_almoco: horario, intervalo: intervaloDerivado, atualizado_em: new Date() }).where(eq(registrosPontoTable.id, prevReg.id)).returning();
    } else {
      const jornadaDia = await getJornadaDia(body.funcionario_id, data, funcionario);
      const feriadoEmp = await isFeriadoEmpresa(empresaId, data);
      const intervaloFinal = prevReg.intervalo ?? jornadaDia?.intervalo_padrao ?? null;
      const jornadaInfo = jornadaDia
        ? { entrada_padrao: jornadaDia.entrada_padrao, saida_padrao: jornadaDia.saida_padrao, intervalo_padrao: jornadaDia.intervalo_padrao, is_folga: jornadaDia.is_folga || feriadoEmp }
        : feriadoEmp ? { entrada_padrao: null, saida_padrao: null, intervalo_padrao: null, is_folga: true as boolean } : null;

      let tipo = isTipoDia(prevReg.tipo_dia) ? prevReg.tipo_dia : "normal" as const;
      if (tipo === "normal" && (isDomFeriado(data) || feriadoEmp)) tipo = "feriado_trabalhado";

      const calc = calcFromTipoDia({
        tipo, entrada: prevReg.entrada, saida: horario, intervalo: intervaloFinal,
        jornada: jornadaInfo, dateStr: data, jornadaDiariaFallback: funcionario.jornada_diaria,
        he100AcimaDe2h: funcionario.he_100_acima_2h ?? true,
        intervaloNaoDescontado: (funcionario as typeof funcionario & { intervalo_nao_descontado?: boolean | null }).intervalo_nao_descontado ?? false,
      });
      const mirror = legacyMirrorFromTipo(tipo, calc.faltas);

      [dbRow] = await db.update(registrosPontoTable).set({
        saida: horario, atualizado_em: new Date(), tipo_dia: tipo,
        total_horas: calc.total_horas, he_60: calc.he_60, he_100: calc.he_100,
        atrasos: calc.atrasos, faltas: mirror.faltas, justificativa: mirror.justificativa,
        horas_justificadas: calc.horas_justificadas,
      }).where(eq(registrosPontoTable.id, prevReg.id)).returning();
    }

    console.log(`[kiosk] Batida: empresa=${empresaId} func=${body.funcionario_id} tipo=${body.tipo} hora=${horario}`);
    res.json({ funcionario_id: body.funcionario_id, tipo: body.tipo, horario, data, registro: dbRow });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
