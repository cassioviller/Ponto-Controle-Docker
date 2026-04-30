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
  getDaysInMonth,
  parseMes,
  getCurrentTimeStr,
  getCurrentDateStr,
  getDiaSemana,
  getDiaSemanaNum,
  isDomFeriado,
  timeToMinutes,
  deriveIntervalo,
} from "../lib/timeUtils";
import { loadOwnedFuncionario } from "../lib/tenantGuard";

const router = Router();

function minutesToTime(m: number): string {
  if (m < 0) m = 0;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function getJornadaDia(funcionarioId: number, dateStr: string) {
  const diaSemana = getDiaSemanaNum(dateStr);
  const jornadas = await db
    .select()
    .from(jornadasPadraoTable)
    .where(
      and(
        eq(jornadasPadraoTable.funcionario_id, funcionarioId),
        eq(jornadasPadraoTable.dia_semana, diaSemana),
      )
    );
  return jornadas[0] ?? null;
}

async function isFeriadoEmpresa(empresaId: number | undefined, dateStr: string): Promise<boolean> {
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
    const jornadaMap = new Map(jornadas.map((j) => [j.dia_semana, j]));

    const folhaDias = days.map((data) => {
      const reg = registroMap.get(data);
      const diaSemana = getDiaSemanaNum(data);
      const jornada = jornadaMap.get(diaSemana) ?? null;
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
    };

    res.json({
      funcionario,
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

    const jornadaDia = await getJornadaDia(body.funcionario_id, body.data);
    const feriadoEmpresa = await isFeriadoEmpresa(empresaId, body.data);

    const lunchPair = (body.saida_almoco ? 1 : 0) + (body.volta_almoco ? 1 : 0);
    if (lunchPair === 1) {
      res.status(400).json({ error: "Informe Saída do almoço E Volta do almoço (ou nenhum dos dois)" });
      return;
    }
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
    const intervaloFinal =
      intervaloDerivado ?? body.intervalo ?? jornadaDia?.intervalo_padrao ?? null;

    const { total_horas } = calcTotalHoras(body.entrada, body.saida, intervaloFinal);

    let he_60: string | null;
    let he_100: string | null;
    let atrasos: string | null;
    let faltas: string | null;

    if (jornadaDia || feriadoEmpresa) {
      const jornadaInfo = jornadaDia ? {
        entrada_padrao: jornadaDia.entrada_padrao,
        saida_padrao: jornadaDia.saida_padrao,
        intervalo_padrao: jornadaDia.intervalo_padrao,
        is_folga: jornadaDia.is_folga || feriadoEmpresa,
      } : {
        entrada_padrao: null,
        saida_padrao: null,
        intervalo_padrao: null,
        is_folga: feriadoEmpresa,
      };

      const calc = calcFromJornada(body.entrada, body.saida, intervaloFinal, jornadaInfo, body.data);
      he_60 = calc.he_60;
      he_100 = calc.he_100;
      atrasos = calc.atrasos;
      faltas = calc.faltas;
    } else {
      const autoHE = calcHEAndAtrasos(
        body.entrada,
        body.saida,
        intervaloFinal,
        jornadaDiaria,
        body.data,
      );
      he_60 = autoHE.he_60;
      he_100 = autoHE.he_100;
      atrasos = autoHE.atrasos;
      faltas = null;
    }

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
      total_horas: total_horas ?? null,
      he_60: body.he_60 !== undefined && body.he_60 !== null ? body.he_60 : he_60,
      he_100: body.he_100 !== undefined && body.he_100 !== null ? body.he_100 : he_100,
      atrasos: body.atrasos !== undefined && body.atrasos !== null ? body.atrasos : atrasos,
      faltas: body.faltas !== undefined && body.faltas !== null ? body.faltas : (faltas ?? null),
      observacoes: body.observacoes ?? null,
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

    let row;
    if (existing.length > 0 && existing[0]) {
      const prevReg = existing[0];

      let updateFields;
      if (body.tipo === "entrada") {
        updateFields = { entrada: horario, atualizado_em: new Date() };
      } else {
        const jornadaDia = await getJornadaDia(body.funcionario_id, data);
        const feriadoEmpresa = await isFeriadoEmpresa(empresaId, data);
        const intervaloFinal = prevReg.intervalo ?? jornadaDia?.intervalo_padrao ?? null;

        let he_60, he_100, atrasos;
        if (jornadaDia || feriadoEmpresa) {
          const jornadaInfo = jornadaDia ? {
            entrada_padrao: jornadaDia.entrada_padrao,
            saida_padrao: jornadaDia.saida_padrao,
            intervalo_padrao: jornadaDia.intervalo_padrao,
            is_folga: jornadaDia.is_folga || feriadoEmpresa,
          } : { entrada_padrao: null, saida_padrao: null, intervalo_padrao: null, is_folga: feriadoEmpresa };
          const calc = calcFromJornada(prevReg.entrada, horario, intervaloFinal, jornadaInfo, data);
          he_60 = calc.he_60;
          he_100 = calc.he_100;
          atrasos = calc.atrasos;
        } else {
          const heAuto = calcHEAndAtrasos(prevReg.entrada, horario, intervaloFinal, funcionario.jornada_diaria, data);
          he_60 = heAuto.he_60;
          he_100 = heAuto.he_100;
          atrasos = heAuto.atrasos;
        }

        updateFields = {
          saida: horario,
          atualizado_em: new Date(),
          total_horas: calcTotalHoras(prevReg.entrada, horario, intervaloFinal).total_horas,
          he_60: he_60 ?? null,
          he_100: he_100 ?? null,
          atrasos: atrasos ?? null,
        };
      }

      [row] = await db
        .update(registrosPontoTable)
        .set(updateFields)
        .where(eq(registrosPontoTable.id, prevReg.id))
        .returning();
    } else {
      const insertData =
        body.tipo === "entrada"
          ? { empresa_id: funcionario.empresa_id ?? empresaId ?? null, funcionario_id: body.funcionario_id, data, entrada: horario }
          : { empresa_id: funcionario.empresa_id ?? empresaId ?? null, funcionario_id: body.funcionario_id, data, saida: horario };

      [row] = await db
        .insert(registrosPontoTable)
        .values(insertData)
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
