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
import { parseMes, getDaysInMonth, getDiaSemana } from "../lib/timeUtils";

const router = Router();

function minutesToTime(m: number): string {
  if (m < 0) m = 0;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function sumTime(registros: any[], field: string): number {
  return registros.reduce((acc: number, r: any) => {
    const val: string = r[field] ?? "00:00";
    const [h, m] = val.split(":").map(Number);
    return acc + (h ?? 0) * 60 + (m ?? 0);
  }, 0);
}

router.get("/consolidado", async (req, res) => {
  try {
    const { mes } = GetConsolidadoQueryParams.parse(req.query);
    const { year, month } = parseMes(mes as string);

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
      const regs = mesRegistros.filter((r) => r.funcionario_id === f.id);

      const totalMin = sumTime(regs, "total_horas");
      const he60Min = sumTime(regs, "he_60");
      const he100Min = sumTime(regs, "he_100");
      const atrasosMin = sumTime(regs, "atrasos");
      const faltas = regs.reduce((acc, r) => acc + parseFloat(r.faltas ?? "0"), 0);
      const diasTrabalhados = regs.filter((r) => r.entrada && r.saida).length;

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

    const totalGeral = {
      funcionario_id: 0,
      nome: "TOTAL GERAL",
      total_horas: minutesToTime(linhas.reduce((acc, l) => {
        const [h, m] = l.total_horas.split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0)),
      he_60: minutesToTime(linhas.reduce((acc, l) => {
        const [h, m] = l.he_60.split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0)),
      he_100: minutesToTime(linhas.reduce((acc, l) => {
        const [h, m] = l.he_100.split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0)),
      atrasos: minutesToTime(linhas.reduce((acc, l) => {
        const [h, m] = l.atrasos.split(":").map(Number);
        return acc + (h ?? 0) * 60 + (m ?? 0);
      }, 0)),
      faltas: linhas.reduce((acc, l) => acc + l.faltas, 0),
      dias_trabalhados: linhas.reduce((acc, l) => acc + l.dias_trabalhados, 0),
      dom_feriados: domingos,
    };

    res.json({ mes, linhas, total_geral: totalGeral });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/resumo", async (req, res) => {
  try {
    const query = GetResumoQueryParams.parse(req.query);
    const { mes, situacao, vinculo } = query as any;
    const { year, month } = parseMes(mes as string);

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

      const he60Min = sumTime(regs, "he_60");
      const he100Min = sumTime(regs, "he_100");
      const atrasosMin = sumTime(regs, "atrasos");
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
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
