import { Router, type Request, type Response } from "express";
import ExcelJS from "exceljs";
import { db } from "@workspace/db";
import {
  registrosPontoTable,
  funcionariosTable,
  jornadasPadraoTable,
  feriadosTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  ExportarFolhaParams,
  ExportarFolhaQueryParams,
  ImportarExcelQueryParams,
} from "@workspace/api-zod";
import {
  parseMes,
  getDaysInMonth,
  getDiaSemana,
  getDiaSemanaNum,
  calcTotalHoras,
  calcHEAndAtrasos,
  calcFromJornada,
  deriveIntervalo,
  isoToBrDate,
  brToIsoDate,
  timeToMinutes,
} from "../lib/timeUtils";
import { loadOwnedFuncionario } from "../lib/tenantGuard";

const router = Router();

const HEADER_STYLE: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: "FFFFFFFF" } },
  fill: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1B5E20" },
  },
  alignment: { horizontal: "center", vertical: "middle" },
  border: {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  },
};

function isValidHHMM(val: string | null): boolean {
  if (!val) return true;
  const match = /^(\d{1,3}):(\d{2})$/.exec(val);
  if (!match) return false;
  const minutes = parseInt(match[2] ?? "0", 10);
  return minutes >= 0 && minutes <= 59;
}

router.get("/exportar/modelo", async (req: Request, res: Response) => {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Controle de Ponto";

    const empresaId = req.empresaId;
    const conditions = [eq(funcionariosTable.ativo, true)];
    if (empresaId) {
      conditions.push(eq(funcionariosTable.empresa_id, empresaId));
    }
    const funcionariosAtivos = await db
      .select()
      .from(funcionariosTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions));

    const funcWs = wb.addWorksheet("Funcionários");
    funcWs.columns = [
      { header: "Código", key: "codigo", width: 10 },
      { header: "Nome", key: "nome", width: 32 },
      { header: "Cargo", key: "cargo", width: 24 },
      { header: "Vínculo", key: "vinculo", width: 16 },
      { header: "Situação", key: "situacao", width: 14 },
      { header: "Jornada Diária", key: "jornada_diaria", width: 16 },
      { header: "Adiantamento", key: "adiantamento", width: 14 },
      { header: "Transporte", key: "transporte", width: 14 },
    ];
    const funcHeader = funcWs.getRow(1);
    funcHeader.eachCell((cell) => { Object.assign(cell, { style: HEADER_STYLE }); });
    funcHeader.height = 22;
    funcionariosAtivos.forEach((f) => {
      funcWs.addRow({
        codigo: f.codigo,
        nome: f.nome,
        cargo: f.cargo,
        vinculo: f.vinculo,
        situacao: f.situacao,
        jornada_diaria: f.jornada_diaria,
        adiantamento: f.adiantamento ? "Sim" : "Não",
        transporte: f.transporte ? "Sim" : "Não",
      });
    });

    const ws = wb.addWorksheet("Registros de Ponto");

    ws.columns = [
      { header: "Data (DD/MM/AAAA)", key: "data", width: 18 },
      { header: "Dia da Semana", key: "dia_semana", width: 16 },
      { header: "Entrada (HH:MM)", key: "entrada", width: 16 },
      { header: "Saída (HH:MM)", key: "saida", width: 16 },
      { header: "Saída Almoço (HH:MM)", key: "saida_almoco", width: 20 },
      { header: "Volta Almoço (HH:MM)", key: "volta_almoco", width: 20 },
      { header: "Intervalo (HH:MM)", key: "intervalo", width: 18 },
      { header: "HE 60% (HH:MM)", key: "he_60", width: 16 },
      { header: "HE 100% (HH:MM)", key: "he_100", width: 16 },
      { header: "Atrasos (HH:MM)", key: "atrasos", width: 16 },
      { header: "Faltas (0 ou 1)", key: "faltas", width: 14 },
      { header: "Observações", key: "observacoes", width: 30 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      Object.assign(cell, { style: HEADER_STYLE });
    });
    headerRow.height = 22;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const days = getDaysInMonth(year, month);

    days.forEach((data) => {
      ws.addRow({
        data: isoToBrDate(data),
        dia_semana: getDiaSemana(data),
        entrada: "",
        saida: "",
        saida_almoco: "",
        volta_almoco: "",
        intervalo: "",
        he_60: "",
        he_100: "",
        atrasos: "",
        faltas: 0,
        observacoes: "",
      });
    });

    const instrWs = wb.addWorksheet("Instruções");
    instrWs.getColumn("A").width = 90;
    const instructions = [
      "INSTRUÇÕES DE PREENCHIMENTO",
      "",
      "1. Data: Use o formato brasileiro DD/MM/AAAA (ex: 01/04/2026). O formato antigo YYYY-MM-DD também é aceito.",
      "2. Horários (Entrada, Saída, Saída Almoço, Volta Almoço, HE 60%, HE 100%, Atrasos): Use HH:MM (ex: 08:00, 12:00, 13:00, 17:30).",
      "3. Saída Almoço / Volta Almoço: Informe os horários reais do almoço. O Intervalo (duração) é calculado automaticamente.",
      "4. Intervalo (HH:MM): Opcional — calculado automaticamente quando Saída Almoço e Volta Almoço estão preenchidos. Pode ser usado como fallback (planilhas antigas).",
      "5. Faltas: Digite 0 (sem falta) ou 1 (dia de falta).",
      "6. Observações: Campo livre para texto.",
      "7. Deixe em branco os campos que não se aplicam ao dia. Sábados e Domingos podem ficar em branco.",
      "",
      "COMO IMPORTAR:",
      "1. Preencha a aba 'Registros de Ponto' com os dados do mês.",
      "2. Salve o arquivo em formato .xlsx.",
      "3. No sistema, vá para a Folha do Funcionário → Importar Excel.",
      "4. Selecione o arquivo e confirme a importação.",
    ];
    instructions.forEach((text) => {
      const row = instrWs.addRow([text]);
      if (text === "INSTRUÇÕES DE PREENCHIMENTO" || text === "COMO IMPORTAR:") {
        row.getCell(1).font = { bold: true, size: 13 };
      }
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=modelo_controle_ponto.xlsx",
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/exportar/folha/:id", async (req: Request, res: Response) => {
  try {
    const { id } = ExportarFolhaParams.parse({ id: Number(req.params.id) });
    const { mes } = ExportarFolhaQueryParams.parse(req.query);
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
      const [rY, rM] = r.data.split("-");
      return parseInt(rY ?? "0") === year && parseInt(rM ?? "0") === month;
    });

    const registroMap = new Map(mesRegistros.map((r) => [r.data, r]));

    const wb = new ExcelJS.Workbook();
    wb.creator = "Controle de Ponto";
    const ws = wb.addWorksheet("Folha Individual");

    ws.mergeCells("A1:M1");
    ws.getCell("A1").value = "CONTROLE DE PONTO — FOLHA INDIVIDUAL";
    ws.getCell("A1").style = {
      font: { bold: true, size: 14 },
      alignment: { horizontal: "center" },
    };

    ws.getRow(2).values = ["Funcionário:", funcionario.nome, "", "", "Cargo:", funcionario.cargo];
    ws.getRow(3).values = ["Mês/Ano:", mes, "", "", "Jornada:", funcionario.jornada_diaria];

    ws.addRow([]);

    ws.columns = [
      { key: "data", width: 14 },
      { key: "dia_semana", width: 14 },
      { key: "entrada", width: 12 },
      { key: "saida", width: 12 },
      { key: "saida_almoco", width: 14 },
      { key: "volta_almoco", width: 14 },
      { key: "intervalo", width: 12 },
      { key: "total_horas", width: 14 },
      { key: "he_60", width: 12 },
      { key: "he_100", width: 14 },
      { key: "atrasos", width: 12 },
      { key: "faltas", width: 10 },
      { key: "observacoes", width: 30 },
    ];

    const headerRow = ws.addRow([
      "Data",
      "Dia da Semana",
      "Entrada",
      "Saída",
      "Saída Almoço",
      "Volta Almoço",
      "Intervalo",
      "Total Horas",
      "HE 60%",
      "HE 100%",
      "Atrasos",
      "Faltas",
      "Observações",
    ]);
    headerRow.eachCell((cell) => Object.assign(cell, { style: HEADER_STYLE }));
    headerRow.height = 22;

    days.forEach((data) => {
      const reg = registroMap.get(data);
      const dt = new Date(data + "T00:00:00");
      const isSabado = dt.getDay() === 6;
      const isDomingo = dt.getDay() === 0;

      const row = ws.addRow({
        data: isoToBrDate(data),
        dia_semana: getDiaSemana(data),
        entrada: reg?.entrada ?? "",
        saida: reg?.saida ?? "",
        saida_almoco: reg?.saida_almoco ?? "",
        volta_almoco: reg?.volta_almoco ?? "",
        intervalo: reg?.intervalo ?? "",
        total_horas: reg?.total_horas ?? "",
        he_60: reg?.he_60 ?? "",
        he_100: reg?.he_100 ?? "",
        atrasos: reg?.atrasos ?? "",
        faltas: reg?.faltas ?? 0,
        observacoes: reg?.observacoes ?? "",
      });

      if (isDomingo) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFFF99" },
          };
        });
      } else if (isSabado) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFD699" },
          };
        });
      }
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=folha_${funcionario.nome.replace(/\s+/g, "_")}_${mes}.xlsx`,
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/importar", async (req: Request, res: Response) => {
  try {
    const query = ImportarExcelQueryParams.parse(req.query);
    const funcionarioId = Number(query.funcionario_id);
    const mes = query.mes as string;
    const empresaId = req.empresaId;

    const funcionario = await loadOwnedFuncionario(funcionarioId, empresaId);
    if (!funcionario) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }

    const { year, month } = parseMes(mes);

    const rawBody = req.body as Buffer | undefined;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      res.status(400).json({ error: "Corpo da requisição inválido. Envie o arquivo como application/octet-stream." });
      return;
    }

    const wb = new ExcelJS.Workbook();
    // ExcelJS declares its own `Buffer extends ArrayBuffer` that conflicts with Node.js Buffer generics
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    await wb.xlsx.load(rawBody);

    const ws =
      wb.getWorksheet("Registros de Ponto") ??
      wb.getWorksheet(1);
    if (!ws) {
      res.status(400).json({ error: "Planilha 'Registros de Ponto' não encontrada no arquivo. Use o modelo fornecido pelo sistema." });
      return;
    }

    const erros: string[] = [];
    let importados = 0;

    const jornadasRows = await db
      .select()
      .from(jornadasPadraoTable)
      .where(eq(jornadasPadraoTable.funcionario_id, funcionarioId));
    const jornadaByDow = new Map<number, typeof jornadasRows[number]>();
    for (const j of jornadasRows) jornadaByDow.set(j.dia_semana, j);

    const feriadoEmpresaId = empresaId ?? funcionario.empresa_id ?? null;
    const feriadoRows = feriadoEmpresaId !== null
      ? await db.select().from(feriadosTable).where(eq(feriadosTable.empresa_id, feriadoEmpresaId))
      : [];
    const feriadoSet = new Set<string>(feriadoRows.map((f) => String(f.data)));

    const headerRow = ws.getRow(1);
    const headerCol5 = String(headerRow.getCell(5).value ?? "").trim().toLowerCase();
    const headerCol6 = String(headerRow.getCell(6).value ?? "").trim().toLowerCase();
    const isNewLayout =
      headerCol5.includes("almo") || headerCol6.includes("almo");

    const COL = isNewLayout
      ? { saidaAlmoco: 5, voltaAlmoco: 6, intervalo: 7, he60: 8, he100: 9, atrasos: 10, faltas: 11, obs: 12 }
      : { saidaAlmoco: null, voltaAlmoco: null, intervalo: 5, he60: 6, he100: 7, atrasos: 8, faltas: 9, obs: 10 };

    const rows = ws.getRows(2, ws.rowCount - 1) ?? [];

    for (const row of rows) {
      const dataVal = row.getCell(1).value;
      if (!dataVal) continue;

      const dataRaw = String(dataVal).trim();
      const dataStr = brToIsoDate(dataRaw);
      if (!dataStr) {
        erros.push(`Linha ${row.number}: data inválida "${dataRaw}" — use DD/MM/AAAA (ex: 01/04/2026)`);
        continue;
      }

      const [rY, rM] = dataStr.split("-");
      if (parseInt(rY ?? "0") !== year || parseInt(rM ?? "0") !== month) {
        continue;
      }

      const getCellStr = (col: number | null): string | null => {
        if (col === null) return null;
        const v = row.getCell(col).value;
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        return s || null;
      };

      const entrada = getCellStr(3);
      const saida = getCellStr(4);
      const saidaAlmoco = getCellStr(COL.saidaAlmoco);
      const voltaAlmoco = getCellStr(COL.voltaAlmoco);
      const intervaloRaw = getCellStr(COL.intervalo);
      const he60 = getCellStr(COL.he60);
      const he100 = getCellStr(COL.he100);
      const atrasos = getCellStr(COL.atrasos);
      const faltasVal = row.getCell(COL.faltas).value;
      const faltas = faltasVal !== null && faltasVal !== undefined ? String(faltasVal) : "0";
      const observacoes = getCellStr(COL.obs);

      if (!entrada && !saida) {
        continue;
      }

      if (entrada && !saida) {
        erros.push(`Linha ${row.number} (${dataRaw}): Entrada informada mas Saída está ausente`);
        continue;
      }
      if (!entrada && saida) {
        erros.push(`Linha ${row.number} (${dataRaw}): Saída informada mas Entrada está ausente`);
        continue;
      }

      const lunchPair = (saidaAlmoco ? 1 : 0) + (voltaAlmoco ? 1 : 0);
      if (lunchPair === 1) {
        erros.push(`Linha ${row.number} (${dataRaw}): informe Saída Almoço E Volta Almoço (ou nenhum dos dois)`);
        continue;
      }

      const timeFields: Array<[string | null, string]> = [
        [entrada, "Entrada"],
        [saida, "Saída"],
        [saidaAlmoco, "Saída Almoço"],
        [voltaAlmoco, "Volta Almoço"],
        [intervaloRaw, "Intervalo"],
        [he60, "HE 60%"],
        [he100, "HE 100%"],
        [atrasos, "Atrasos"],
      ];

      const timeErrors = timeFields
        .filter(([val]) => val !== null && !isValidHHMM(val))
        .map(([val, label]) => `${label} inválido "${val}" — use HH:MM (minutos 00-59)`);
      if (timeErrors.length > 0) {
        erros.push(`Linha ${row.number} (${dataRaw}): ${timeErrors.join("; ")}`);
        continue;
      }

      if (saidaAlmoco && voltaAlmoco) {
        if (timeToMinutes(voltaAlmoco) <= timeToMinutes(saidaAlmoco)) {
          erros.push(`Linha ${row.number} (${dataRaw}): Volta Almoço (${voltaAlmoco}) deve ser maior que Saída Almoço (${saidaAlmoco})`);
          continue;
        }
        if (entrada && saida) {
          if (timeToMinutes(saidaAlmoco) < timeToMinutes(entrada) || timeToMinutes(voltaAlmoco) > timeToMinutes(saida)) {
            erros.push(`Linha ${row.number} (${dataRaw}): horários de almoço fora do intervalo Entrada→Saída`);
            continue;
          }
        }
      }

      const intervaloDerivado = deriveIntervalo(saidaAlmoco, voltaAlmoco);
      const intervalo = intervaloDerivado ?? intervaloRaw ?? "00:00";

      const { total_horas } = calcTotalHoras(entrada, saida, intervalo);

      const autoHE = calcHEAndAtrasos(
        entrada,
        saida,
        intervalo,
        funcionario.jornada_diaria,
        dataStr,
      );

      const existing = await db
        .select()
        .from(registrosPontoTable)
        .where(
          and(
            eq(registrosPontoTable.funcionario_id, funcionarioId),
            eq(registrosPontoTable.data, dataStr),
          ),
        );

      const existingJustificativa = (existing[0]?.justificativa ?? "nenhuma") as
        | "nenhuma"
        | "justificada"
        | "injustificada";

      let finalTotalHoras: string | null = total_horas;
      let finalHe60: string | null = he60 ?? autoHE.he_60;
      let finalHe100: string | null = he100 ?? autoHE.he_100;
      let finalAtrasos: string | null = atrasos ?? autoHE.atrasos;
      let finalFaltas: string | null = faltas;
      let finalHorasJust: string | null = null;

      if (existingJustificativa === "justificada") {
        const dow = getDiaSemanaNum(dataStr);
        const jornadaDoDia = jornadaByDow.get(dow);
        const isFeriadoEmp = feriadoSet.has(dataStr);
        const jornadaInfo = jornadaDoDia ? {
          entrada_padrao: jornadaDoDia.entrada_padrao,
          saida_padrao: jornadaDoDia.saida_padrao,
          intervalo_padrao: jornadaDoDia.intervalo_padrao,
          is_folga: jornadaDoDia.is_folga || isFeriadoEmp,
        } : (isFeriadoEmp ? {
          entrada_padrao: null,
          saida_padrao: null,
          intervalo_padrao: null,
          is_folga: true as boolean,
        } : null);
        const calc = calcFromJornada(
          entrada,
          saida,
          intervalo,
          jornadaInfo,
          dataStr,
          "justificada",
          funcionario.jornada_diaria,
        );
        finalTotalHoras = calc.total_horas;
        finalHe60 = calc.he_60;
        finalHe100 = calc.he_100;
        finalAtrasos = calc.atrasos;
        finalFaltas = calc.faltas;
        finalHorasJust = calc.horas_justificadas;
      }

      const dataToSave = {
        empresa_id: funcionario.empresa_id ?? empresaId ?? null,
        funcionario_id: funcionarioId,
        data: dataStr,
        entrada,
        saida,
        saida_almoco: saidaAlmoco,
        volta_almoco: voltaAlmoco,
        intervalo,
        total_horas: finalTotalHoras,
        he_60: finalHe60,
        he_100: finalHe100,
        atrasos: finalAtrasos,
        faltas: finalFaltas,
        observacoes,
        justificativa: existingJustificativa,
        horas_justificadas: finalHorasJust,
        atualizado_em: new Date(),
      };

      if (existing.length > 0 && existing[0]) {
        await db
          .update(registrosPontoTable)
          .set(dataToSave)
          .where(eq(registrosPontoTable.id, existing[0].id));
      } else {
        await db.insert(registrosPontoTable).values(dataToSave);
      }

      importados++;
    }

    res.json({ importados, erros, mes });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
