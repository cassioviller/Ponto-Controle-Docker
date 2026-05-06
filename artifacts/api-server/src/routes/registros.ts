import { Router } from "express";
import { db } from "@workspace/db";
import {
  registrosPontoTable,
  funcionariosTable,
  jornadasPadraoTable,
  feriadosTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  GetRegistrosFuncionarioParams,
  GetRegistrosFuncionarioQueryParams,
  UpsertRegistroBody,
  BaterPontoBody,
} from "@workspace/api-zod";
import {
  calcTotalHoras,
  calcHEAndAtrasos,
  calcFromJornada,
  calcFromTipoDia,
  isTipoDia,
  legacyMirrorFromTipo,
  tipoFromLegacy,
  getDaysInMonth,
  parseMes,
  getCurrentTimeStr,
  getCurrentDateStr,
  getDiaSemana,
  getDiaSemanaNum,
  isDomFeriado,
  timeToMinutes,
  deriveIntervalo,
  computeSemanaForDate,
  type TipoDia,
} from "../lib/timeUtils";
import { loadOwnedFuncionario } from "../lib/tenantGuard";
import { serializeFuncionario } from "./funcionarios";

const router = Router();

function minutesToTime(m: number): string {
  if (m < 0) m = 0;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function getJornadaDia(
  funcionarioId: number,
  dateStr: string,
  funcionario?: { escala_quinzenal?: boolean | null; quinzena_referencia?: string | null } | null,
) {
  const diaSemana = getDiaSemanaNum(dateStr);
  const semana = funcionario?.escala_quinzenal
    ? computeSemanaForDate(dateStr, funcionario.quinzena_referencia ?? null)
    : 1;
  const jornadas = await db
    .select()
    .from(jornadasPadraoTable)
    .where(
      and(
        eq(jornadasPadraoTable.funcionario_id, funcionarioId),
        eq(jornadasPadraoTable.dia_semana, diaSemana),
        eq(jornadasPadraoTable.semana, semana),
      )
    );
  // Fallback: se não houver linha para a Semana B, usa a Semana A (compat).
  if (jornadas[0]) return jornadas[0];
  if (semana === 2) {
    const fallback = await db
      .select()
      .from(jornadasPadraoTable)
      .where(
        and(
          eq(jornadasPadraoTable.funcionario_id, funcionarioId),
          eq(jornadasPadraoTable.dia_semana, diaSemana),
          eq(jornadasPadraoTable.semana, 1),
        )
      );
    return fallback[0] ?? null;
  }
  return null;
}

export async function isFeriadoEmpresa(empresaId: number | undefined, dateStr: string): Promise<boolean> {
  if (!empresaId) return false;
  const feriados = await db
    .select()
    .from(feriadosTable)
    .where(
      and(
        eq(feriadosTable.empresa_id, empresaId),
        eq(feriadosTable.data, dateStr),
      )
    );
  return feriados.length > 0;
}

router.get("/funcionarios/:id/registros", async (req, res) => {
  try {
    const { id } = GetRegistrosFuncionarioParams.parse({
      id: Number(req.params.id),
    });
    const { mes } = GetRegistrosFuncionarioQueryParams.parse(req.query);
    const empresaId = req.empresaId;

    const funcionario = await loadOwnedFuncionario(id, empresaId);
    if (!funcionario) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }

    const { year, month } = parseMes(mes as string);
    const days = getDaysInMonth(year, month);

    const allRegistros = await db
      .select()
      .from(registrosPontoTable)
      .where(eq(registrosPontoTable.funcionario_id, id));

    const mesRegistros = allRegistros.filter((r) => {
      const [rYear, rMonth] = r.data.split("-");
      return parseInt(rYear ?? "0") === year && parseInt(rMonth ?? "0") === month;
    });

    const registroMap = new Map(mesRegistros.map((r) => [r.data, r]));

    const jornadas = await db
      .select()
      .from(jornadasPadraoTable)
      .where(eq(jornadasPadraoTable.funcionario_id, id));
    // Chaveado por (dia_semana, semana). Para funcionários sem escala quinzenal,
    // só existem rows com semana=1.
    const jornadaMap = new Map<string, typeof jornadas[number]>();
    for (const j of jornadas) jornadaMap.set(`${j.dia_semana}-${j.semana}`, j);

    const folhaDias = days.map((data) => {
      const reg = registroMap.get(data);
      const diaSemana = getDiaSemanaNum(data);
      const semana = funcionario.escala_quinzenal
        ? computeSemanaForDate(data, funcionario.quinzena_referencia ?? null)
        : 1;
      const jornada =
        jornadaMap.get(`${diaSemana}-${semana}`) ??
        (semana === 2 ? jornadaMap.get(`${diaSemana}-1`) ?? null : null);
      return {
        id: reg?.id ?? null,
        funcionario_id: id,
        data,
        dia_semana: getDiaSemana(data),
        entrada: reg?.entrada ?? null,
        saida: reg?.saida ?? null,
        saida_almoco: reg?.saida_almoco ?? null,
        volta_almoco: reg?.volta_almoco ?? null,
        intervalo: reg?.intervalo ?? null,
        total_horas: reg?.total_horas ?? null,
        he_60: reg?.he_60 ?? null,
        he_100: reg?.he_100 ?? null,
        atrasos: reg?.atrasos ?? null,
        faltas: reg?.faltas ?? null,
        observacoes: reg?.observacoes ?? null,
        justificativa: reg?.justificativa ?? "nenhuma",
        horas_justificadas: reg?.horas_justificadas ?? null,
        tipo_dia: reg?.tipo_dia ?? "normal",
        jornada_padrao: jornada ? {
          entrada_padrao: jornada.entrada_padrao,
          saida_padrao: jornada.saida_padrao,
          intervalo_padrao: jornada.intervalo_padrao,
          is_folga: jornada.is_folga,
        } : null,
      };
    });

    const totalHoras = mesRegistros.reduce((acc, r) => {
      const [h, m] = (r.total_horas ?? "00:00").split(":").map(Number);
      return acc + (h ?? 0) * 60 + (m ?? 0);
    }, 0);

    const heTotal60 = mesRegistros.reduce((acc, r) => {
      const [h, m] = (r.he_60 ?? "00:00").split(":").map(Number);
      return acc + (h ?? 0) * 60 + (m ?? 0);
    }, 0);

    const heTotal100 = mesRegistros.reduce((acc, r) => {
      const [h, m] = (r.he_100 ?? "00:00").split(":").map(Number);
      return acc + (h ?? 0) * 60 + (m ?? 0);
    }, 0);

    const atrasosTotal = mesRegistros.reduce((acc, r) => {
      const [h, m] = (r.atrasos ?? "00:00").split(":").map(Number);
      return acc + (h ?? 0) * 60 + (m ?? 0);
    }, 0);

    const faltasDia = mesRegistros.reduce((acc, r) => {
      return acc + parseFloat(r.faltas ?? "0");
    }, 0);

    const horasJustificadasMin = mesRegistros.reduce((acc, r) => {
      const [h, m] = (r.horas_justificadas ?? "00:00").split(":").map(Number);
      return acc + (h ?? 0) * 60 + (m ?? 0);
    }, 0);

    const diasJustificados = mesRegistros.filter(
      (r) => r.justificativa === "justificada",
    ).length;

    const diasTrabalhados = mesRegistros.filter(
      (r) => r.entrada && r.saida,
    ).length;

    const domFeriados = mesRegistros.filter(
      (r) => isDomFeriado(r.data) && r.entrada && r.saida,
    ).length;

    const resumo = {
      total_horas: minutesToTime(totalHoras),
      he_60: minutesToTime(heTotal60),
      he_100: minutesToTime(heTotal100),
      atrasos: minutesToTime(atrasosTotal),
      faltas_dia: faltasDia,
      faltas_horas: minutesToTime(faltasDia * (timeToMinutes(funcionario.jornada_diaria) || 480)),
      dias_trabalhados: diasTrabalhados,
      dom_feriados: domFeriados,
      horas_justificadas: minutesToTime(horasJustificadasMin),
      dias_justificados: diasJustificados,
    };

    res.json({
      funcionario: serializeFuncionario(funcionario),
      mes,
      registros: folhaDias,
      resumo,
    });
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.post("/registros", async (req, res) => {
  try {
    const body = UpsertRegistroBody.parse(req.body);
    const empresaId = req.empresaId ?? undefined;

    const funcionario = await loadOwnedFuncionario(body.funcionario_id, empresaId);
    if (!funcionario) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }

    const jornadaDiaria = funcionario.jornada_diaria ?? "08:00";

    const jornadaDia = await getJornadaDia(body.funcionario_id, body.data, funcionario);
    const feriadoEmpresa = await isFeriadoEmpresa(empresaId, body.data);

    // Permite salvar apenas uma das pontas do intervalo (saída/volta de almoço).
    // Útil para edição inline da Folha Individual: o usuário preenche uma ponta
    // e depois a outra. O intervalo derivado só é calculado quando ambas existem.
    if (body.saida_almoco && body.volta_almoco) {
      if (timeToMinutes(body.volta_almoco) <= timeToMinutes(body.saida_almoco)) {
        res.status(400).json({ error: "Volta do almoço deve ser maior que Saída do almoço" });
        return;
      }
      if (body.entrada && body.saida) {
        if (
          timeToMinutes(body.saida_almoco) < timeToMinutes(body.entrada) ||
          timeToMinutes(body.volta_almoco) > timeToMinutes(body.saida)
        ) {
          res.status(400).json({ error: "Horários do almoço devem ficar entre Entrada e Saída" });
          return;
        }
      }
    }
    const intervaloDerivado = deriveIntervalo(body.saida_almoco, body.volta_almoco);
    // body.intervalo (se enviado) tem precedência sobre o intervalo_padrao da jornada,
    // permitindo override explícito por dia (incluindo "00:00" = sem intervalo).
    const intervaloFinal =
      intervaloDerivado ?? body.intervalo ?? jornadaDia?.intervalo_padrao ?? null;

    const jornadaInfoBase = jornadaDia ? {
      entrada_padrao: jornadaDia.entrada_padrao,
      saida_padrao: jornadaDia.saida_padrao,
      intervalo_padrao: jornadaDia.intervalo_padrao,
      is_folga: jornadaDia.is_folga || feriadoEmpresa,
    } : (feriadoEmpresa ? {
      entrada_padrao: null,
      saida_padrao: null,
      intervalo_padrao: null,
      is_folga: true as boolean,
    } : null);

    // Resolver tipo_dia: prioridade → body.tipo_dia explícito; senão derivar de
    // (justificativa, faltas) legados; senão usar default 'normal' / contexto domingo/feriado.
    const hasHorasTrabalhadas = !!(body.entrada && body.saida);
    const isDomingo = isDomFeriado(body.data);
    const isDomOuFeriado = isDomingo || feriadoEmpresa;

    let tipo: TipoDia;
    if (isTipoDia(body.tipo_dia)) {
      tipo = body.tipo_dia;
    } else {
      tipo = tipoFromLegacy(
        (body.justificativa ?? null) as "nenhuma" | "justificada" | "injustificada" | null,
        body.faltas ?? null,
        hasHorasTrabalhadas,
        isDomOuFeriado,
      );
    }

    const calc = calcFromTipoDia({
      tipo,
      entrada: body.entrada,
      saida: body.saida,
      intervalo: intervaloFinal,
      jornada: jornadaInfoBase,
      dateStr: body.data,
      jornadaDiariaFallback: jornadaDiaria,
      he100AcimaDe2h: funcionario.he_100_acima_2h ?? true,
    });

    const mirror = legacyMirrorFromTipo(tipo, calc.faltas);

    const existing = await db
      .select()
      .from(registrosPontoTable)
      .where(
        and(
          eq(registrosPontoTable.funcionario_id, body.funcionario_id),
          eq(registrosPontoTable.data, body.data),
        ),
      );

    const dataToSave = {
      empresa_id: funcionario.empresa_id ?? empresaId ?? null,
      funcionario_id: body.funcionario_id,
      data: body.data,
      entrada: body.entrada ?? null,
      saida: body.saida ?? null,
      saida_almoco: body.saida_almoco ?? null,
      volta_almoco: body.volta_almoco ?? null,
      intervalo: intervaloFinal ?? null,
      total_horas: calc.total_horas ?? null,
      he_60: calc.he_60,
      he_100: calc.he_100,
      atrasos: calc.atrasos,
      faltas: mirror.faltas,
      observacoes: body.observacoes ?? null,
      justificativa: mirror.justificativa,
      horas_justificadas: calc.horas_justificadas,
      tipo_dia: tipo,
      atualizado_em: new Date(),
    };

    let row;
    if (existing.length > 0 && existing[0]) {
      [row] = await db
        .update(registrosPontoTable)
        .set(dataToSave)
        .where(eq(registrosPontoTable.id, existing[0].id))
        .returning();
    } else {
      [row] = await db
        .insert(registrosPontoTable)
        .values(dataToSave)
        .returning();
    }

    res.json(row);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.post("/ponto/bater", async (req, res) => {
  try {
    const body = BaterPontoBody.parse(req.body);
    const horario = getCurrentTimeStr();
    const data = getCurrentDateStr();
    const empresaId = req.empresaId ?? undefined;

    const funcionario = await loadOwnedFuncionario(body.funcionario_id, empresaId);
    if (!funcionario) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }

    const existing = await db
      .select()
      .from(registrosPontoTable)
      .where(
        and(
          eq(registrosPontoTable.funcionario_id, body.funcionario_id),
          eq(registrosPontoTable.data, data),
        ),
      );

    const prevReg = existing[0] ?? null;

    const has = {
      entrada: !!prevReg?.entrada,
      saida_almoco: !!prevReg?.saida_almoco,
      volta_almoco: !!prevReg?.volta_almoco,
      saida: !!prevReg?.saida,
    };

    if (has.saida) {
      res.status(400).json({ error: "Saída do dia já foi registrada" });
      return;
    }

    if (body.tipo === "entrada") {
      if (has.entrada) {
        res.status(400).json({ error: "Entrada já registrada hoje" });
        return;
      }
    } else if (body.tipo === "saida_almoco") {
      if (!has.entrada) {
        res.status(400).json({ error: "Registre a Entrada antes da Saída do Intervalo" });
        return;
      }
      if (has.saida_almoco) {
        res.status(400).json({ error: "Saída do Intervalo já registrada hoje" });
        return;
      }
    } else if (body.tipo === "volta_almoco") {
      if (!has.entrada) {
        res.status(400).json({ error: "Registre a Entrada antes da Volta do Intervalo" });
        return;
      }
      if (!has.saida_almoco) {
        res.status(400).json({ error: "Registre a Saída do Intervalo antes da Volta" });
        return;
      }
      if (has.volta_almoco) {
        res.status(400).json({ error: "Volta do Intervalo já registrada hoje" });
        return;
      }
    } else if (body.tipo === "saida") {
      if (!has.entrada) {
        res.status(400).json({ error: "Registre a Entrada antes da Saída" });
        return;
      }
      if (!has.saida_almoco) {
        res.status(400).json({ error: "Registre a Saída do Intervalo antes da Saída" });
        return;
      }
      if (!has.volta_almoco) {
        res.status(400).json({ error: "Registre a Volta do Intervalo antes da Saída" });
        return;
      }
    }

    let row;

    if (!prevReg) {
      const insertData = {
        empresa_id: funcionario.empresa_id ?? empresaId ?? null,
        funcionario_id: body.funcionario_id,
        data,
        entrada: body.tipo === "entrada" ? horario : null,
        saida: body.tipo === "saida" ? horario : null,
        saida_almoco: body.tipo === "saida_almoco" ? horario : null,
        volta_almoco: body.tipo === "volta_almoco" ? horario : null,
      };

      [row] = await db
        .insert(registrosPontoTable)
        .values(insertData)
        .returning();
    } else if (body.tipo === "entrada") {
      [row] = await db
        .update(registrosPontoTable)
        .set({ entrada: horario, atualizado_em: new Date() })
        .where(eq(registrosPontoTable.id, prevReg.id))
        .returning();
    } else if (body.tipo === "saida_almoco") {
      [row] = await db
        .update(registrosPontoTable)
        .set({ saida_almoco: horario, atualizado_em: new Date() })
        .where(eq(registrosPontoTable.id, prevReg.id))
        .returning();
    } else if (body.tipo === "volta_almoco") {
      const intervaloDerivado = deriveIntervalo(prevReg.saida_almoco, horario);
      [row] = await db
        .update(registrosPontoTable)
        .set({
          volta_almoco: horario,
          intervalo: intervaloDerivado,
          atualizado_em: new Date(),
        })
        .where(eq(registrosPontoTable.id, prevReg.id))
        .returning();
    } else {
      const jornadaDia = await getJornadaDia(body.funcionario_id, data, funcionario);
      const feriadoEmpresa = await isFeriadoEmpresa(empresaId, data);
      const intervaloFinal = prevReg.intervalo ?? jornadaDia?.intervalo_padrao ?? null;

      const jornadaInfo = jornadaDia ? {
        entrada_padrao: jornadaDia.entrada_padrao,
        saida_padrao: jornadaDia.saida_padrao,
        intervalo_padrao: jornadaDia.intervalo_padrao,
        is_folga: jornadaDia.is_folga || feriadoEmpresa,
      } : (feriadoEmpresa ? {
        entrada_padrao: null,
        saida_padrao: null,
        intervalo_padrao: null,
        is_folga: true as boolean,
      } : null);

      let tipo: TipoDia = isTipoDia(prevReg.tipo_dia) ? prevReg.tipo_dia : "normal";
      // Se o tipo ainda é o default ('normal') e o dia é domingo/feriado, inferir feriado_trabalhado.
      if (tipo === "normal" && (isDomFeriado(data) || feriadoEmpresa)) {
        tipo = "feriado_trabalhado";
      }
      const calc = calcFromTipoDia({
        tipo,
        entrada: prevReg.entrada,
        saida: horario,
        intervalo: intervaloFinal,
        jornada: jornadaInfo,
        dateStr: data,
        jornadaDiariaFallback: funcionario.jornada_diaria,
        he100AcimaDe2h: funcionario.he_100_acima_2h ?? true,
      });
      const mirror = legacyMirrorFromTipo(tipo, calc.faltas);

      [row] = await db
        .update(registrosPontoTable)
        .set({
          saida: horario,
          atualizado_em: new Date(),
          tipo_dia: tipo,
          total_horas: calc.total_horas,
          he_60: calc.he_60,
          he_100: calc.he_100,
          atrasos: calc.atrasos,
          faltas: mirror.faltas,
          justificativa: mirror.justificativa,
          horas_justificadas: calc.horas_justificadas,
        })
        .where(eq(registrosPontoTable.id, prevReg.id))
        .returning();
    }

    res.json({
      funcionario_id: body.funcionario_id,
      tipo: body.tipo,
      horario,
      data,
      registro: row,
    });
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

export default router;
