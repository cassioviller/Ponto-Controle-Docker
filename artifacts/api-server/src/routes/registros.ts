import { Router } from "express";
import { db } from "@workspace/db";
import {
  registrosPontoTable,
  funcionariosTable,
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
  getDaysInMonth,
  parseMes,
  getCurrentTimeStr,
  getCurrentDateStr,
  getDiaSemana,
  isDomFeriado,
} from "../lib/timeUtils";

const router = Router();

function minutesToTime(m: number): string {
  if (m < 0) m = 0;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

router.get("/funcionarios/:id/registros", async (req, res) => {
  try {
    const { id } = GetRegistrosFuncionarioParams.parse({
      id: Number(req.params.id),
    });
    const { mes } = GetRegistrosFuncionarioQueryParams.parse(req.query);

    const [funcionario] = await db
      .select()
      .from(funcionariosTable)
      .where(eq(funcionariosTable.id, id));

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

    const folhaDias = days.map((data) => {
      const reg = registroMap.get(data);
      return {
        id: reg?.id ?? null,
        funcionario_id: id,
        data,
        dia_semana: getDiaSemana(data),
        entrada: reg?.entrada ?? null,
        saida: reg?.saida ?? null,
        intervalo: reg?.intervalo ?? null,
        total_horas: reg?.total_horas ?? null,
        he_60: reg?.he_60 ?? null,
        he_100: reg?.he_100 ?? null,
        atrasos: reg?.atrasos ?? null,
        faltas: reg?.faltas ?? null,
        observacoes: reg?.observacoes ?? null,
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

    const domFeriados = folhaDias.filter((d) => isDomFeriado(d.data)).length;

    const resumo = {
      total_horas: minutesToTime(totalHoras),
      he_60: minutesToTime(heTotal60),
      he_100: minutesToTime(heTotal100),
      atrasos: minutesToTime(atrasosTotal),
      faltas_dia: faltasDia,
      faltas_horas: minutesToTime(faltasDia * 480),
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

    const [funcionario] = await db
      .select()
      .from(funcionariosTable)
      .where(eq(funcionariosTable.id, body.funcionario_id));

    const jornadaDiaria = funcionario?.jornada_diaria ?? "08:00";

    const { total_horas } = calcTotalHoras(body.entrada, body.saida, body.intervalo);

    const autoHE = calcHEAndAtrasos(
      body.entrada,
      body.saida,
      body.intervalo,
      jornadaDiaria,
      body.data,
    );

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
      funcionario_id: body.funcionario_id,
      data: body.data,
      entrada: body.entrada ?? null,
      saida: body.saida ?? null,
      intervalo: body.intervalo ?? null,
      total_horas: total_horas ?? null,
      he_60: body.he_60 !== undefined ? body.he_60 : autoHE.he_60,
      he_100: body.he_100 !== undefined ? body.he_100 : autoHE.he_100,
      atrasos: body.atrasos !== undefined ? body.atrasos : autoHE.atrasos,
      faltas: body.faltas ?? null,
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

    const [funcionario] = await db
      .select()
      .from(funcionariosTable)
      .where(eq(funcionariosTable.id, body.funcionario_id));

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
      const heAuto =
        body.tipo === "saida"
          ? calcHEAndAtrasos(prevReg.entrada, horario, prevReg.intervalo, funcionario.jornada_diaria, data)
          : { he_60: undefined, he_100: undefined, atrasos: undefined };

      const updateFields =
        body.tipo === "entrada"
          ? { entrada: horario, atualizado_em: new Date() }
          : {
              saida: horario,
              atualizado_em: new Date(),
              total_horas: calcTotalHoras(prevReg.entrada, horario, prevReg.intervalo).total_horas,
              he_60: heAuto.he_60 ?? null,
              he_100: heAuto.he_100 ?? null,
              atrasos: heAuto.atrasos ?? null,
            };

      [row] = await db
        .update(registrosPontoTable)
        .set(updateFields)
        .where(eq(registrosPontoTable.id, prevReg.id))
        .returning();
    } else {
      const insertData =
        body.tipo === "entrada"
          ? { funcionario_id: body.funcionario_id, data, entrada: horario }
          : { funcionario_id: body.funcionario_id, data, saida: horario };

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
