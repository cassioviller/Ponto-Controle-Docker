import { Router } from "express";
import { db } from "@workspace/db";
import {
  registrosPontoTable,
  funcionariosTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  GetConsolidadoQueryParams,
  GetResumoQueryParams,
} from "@workspace/api-zod";
import { parseMes, getDaysInMonth } from "../lib/timeUtils";

const router = Router();

function minutesToTime(m: number): string {
  if (m < 0) m = 0;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function sumTimeField(registros: Array<Record<string, string | null>>, field: string): number {
  return registros.reduce((acc, r) => {
    const val: string = (r[field] as string) ?? "00:00";
    const [h, m] = val.split(":").map(Number);
    return acc + (h ?? 0) * 60 + (m ?? 0);
  }, 0);
}

router.get("/consolidado", async (req, res) => {
  try {
    const parsed = GetConsolidadoQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Parâmetro 'mes' é obrigatório (YYYY-MM)" });
      return;
    }
    const { mes } = parsed.data;
    const { year, month } = parseMes(mes);

    const funcionarios = await db
      .select()
      .from(funcionariosTable)
      .where(eq(funcionariosTable.ativo, true));

    const allRegistros = await db.select().from(registrosPontoTable);

    const mesRegistros = allRegistros.filter((r) => {
      const [rYear, rMonth] = r.data.split("-");
      return (
        parseInt(rYear ?? "0") === year && parseInt(rMonth ?? "0") === month
      );
    });

    const days = getDaysInMonth(year, month);
    const domingos = days.filter((d) => new Date(d + "T00:00:00").getDay() === 0).length;

    const linhas = funcionarios.map((f) => {
      const regs = mesRegistros
        .filter((r) => r.funcionario_id === f.id)
        .map((r) => ({ ...r, total_horas: r.total_horas, he_60: r.he_60, he_100: r.he_100, atrasos: r.atrasos }));

      const totalMin = regs.reduce((acc, r) => {
        const [h, m] = (r.total_horas ?? "00:00").split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0);
      const he60Min = regs.reduce((acc, r) => {
        const [h, m] = (r.he_60 ?? "00:00").split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0);
      const he100Min = regs.reduce((acc, r) => {
        const [h, m] = (r.he_100 ?? "00:00").split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0);
      const atrasosMin = regs.reduce((acc, r) => {
        const [h, m] = (r.atrasos ?? "00:00").split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0);
      const faltas = mesRegistros
        .filter((r) => r.funcionario_id === f.id)
        .reduce((acc, r) => acc + parseFloat(r.faltas ?? "0"), 0);
      const diasTrabalhados = mesRegistros
        .filter((r) => r.funcionario_id === f.id && r.entrada && r.saida)
        .length;

      return {
        funcionario_id: f.id,
        nome: f.nome,
        total_horas: minutesToTime(totalMin),
        he_60: minutesToTime(he60Min),
        he_100: minutesToTime(he100Min),
        atrasos: minutesToTime(atrasosMin),
        faltas,
        dias_trabalhados: diasTrabalhados,
        dom_feriados: domingos,
      };
    });

    const sumHHMM = (items: typeof linhas, field: "total_horas" | "he_60" | "he_100" | "atrasos") =>
      minutesToTime(items.reduce((acc, l) => {
        const [h, m] = l[field].split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0));

    const totalGeral = {
      funcionario_id: 0,
      nome: "TOTAL GERAL",
      total_horas: sumHHMM(linhas, "total_horas"),
      he_60: sumHHMM(linhas, "he_60"),
      he_100: sumHHMM(linhas, "he_100"),
      atrasos: sumHHMM(linhas, "atrasos"),
      faltas: linhas.reduce((acc, l) => acc + l.faltas, 0),
      dias_trabalhados: linhas.reduce((acc, l) => acc + l.dias_trabalhados, 0),
      dom_feriados: domingos,
    };

    res.json({ mes, linhas, total_geral: totalGeral });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

router.get("/resumo", async (req, res) => {
  try {
    const parsed = GetResumoQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Parâmetro 'mes' é obrigatório (YYYY-MM)" });
      return;
    }
    const { mes, situacao, vinculo } = parsed.data;
    const { year, month } = parseMes(mes);

    let funcionarios = await db.select().from(funcionariosTable);

    if (situacao) {
      funcionarios = funcionarios.filter((f) => f.situacao === situacao);
    }
    if (vinculo) {
      funcionarios = funcionarios.filter((f) => f.vinculo === vinculo);
    }

    const allRegistros = await db.select().from(registrosPontoTable);
    const mesRegistros = allRegistros.filter((r) => {
      const [rYear, rMonth] = r.data.split("-");
      return (
        parseInt(rYear ?? "0") === year && parseInt(rMonth ?? "0") === month
      );
    });

    const result = funcionarios.map((f) => {
      const regs = mesRegistros.filter((r) => r.funcionario_id === f.id);

      const he60Min = regs.reduce((acc, r) => {
        const [h, m] = (r.he_60 ?? "00:00").split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0);
      const he100Min = regs.reduce((acc, r) => {
        const [h, m] = (r.he_100 ?? "00:00").split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0);
      const atrasosMin = regs.reduce((acc, r) => {
        const [h, m] = (r.atrasos ?? "00:00").split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0);
      const faltasDia = regs.reduce((acc, r) => acc + parseFloat(r.faltas ?? "0"), 0);
      const faltasHorasMin = Math.round(faltasDia * 480);

      return {
        id: f.id,
        codigo: f.codigo,
        nome: f.nome,
        cargo: f.cargo,
        vinculo: f.vinculo,
        situacao: f.situacao,
        adiantamento: f.adiantamento,
        transporte: f.transporte,
        jornada_diaria: f.jornada_diaria,
        faltas_dia: faltasDia,
        faltas_horas: minutesToTime(faltasHorasMin),
        he_60: minutesToTime(he60Min),
        he_100: minutesToTime(he100Min),
      };
    });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

export default router;
