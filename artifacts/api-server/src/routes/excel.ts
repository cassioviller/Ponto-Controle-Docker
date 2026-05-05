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
  calcFromTipoDia,
  isTipoDia,
  legacyMirrorFromTipo,
  TIPOS_DIA,
  type TipoDia,
  deriveIntervalo,
  isoToBrDate,
  brToIsoDate,
  timeToMinutes,
  normalizeHHMM,
  computeSemanaForDate,
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

const TIPO_LABEL: Record<TipoDia, string> = {
  normal: "Normal",
  feriado: "Feriado",
  feriado_trabalhado: "Feriado Trabalhado",
  falta: "Falta",
  falta_justificada: "Falta Justificada",
  atraso_justificado: "Atraso Justificado",
};

const TIPO_COLOR: Record<TipoDia, string | null> = {
  normal: null,
  feriado: "FFFFF59D",
  feriado_trabalhado: "FFFFE082",
  falta: "FFFFCDD2",
  falta_justificada: "FFC8E6C9",
  atraso_justificado: "FFBBDEFB",
};

const LABEL_TO_TIPO: Record<string, TipoDia> = {};
for (const t of TIPOS_DIA) {
  LABEL_TO_TIPO[TIPO_LABEL[t].toLowerCase()] = t;
  LABEL_TO_TIPO[t] = t;
}

function parseTipoDia(raw: string | null): TipoDia | null {
  if (!raw) return null;
  const norm = raw.trim().toLowerCase();
  if (!norm) return null;
  return LABEL_TO_TIPO[norm] ?? null;
}

function isValidHHMM(val: string | null): boolean {
  if (!val) return true;
  const match = /^(\d{1,3}):(\d{2})$/.exec(val);
  if (!match) return false;
  const minutes = parseInt(match[2] ?? "0", 10);
  return minutes >= 0 && minutes <= 59;
}

// Formato customizado do Excel que faz um número como 800 ser exibido
// como "08:00" e 1730 como "17:30". O usuário digita só os 4 números
// e o ':' aparece automaticamente.
const HHMM_NUMFMT = '00":"00';

// Converte uma string "HH:MM" no número compacto que o formato HHMM_NUMFMT
// renderiza como HH:MM (ex.: "08:00" -> 800, "17:30" -> 1730). Devolve
// null para entradas vazias / inválidas (o ExcelJS deixa a célula em branco).
function hhmmStrToExcelNumber(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const h = parseInt(m[1] ?? "0", 10);
  const mn = parseInt(m[2] ?? "0", 10);
  if (isNaN(h) || isNaN(mn)) return null;
  return h * 100 + mn;
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
      { header: "Vale Transporte", key: "transporte", width: 16 },
      { header: "Vale Alimentação", key: "vale_alimentacao", width: 18 },
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
        jornada_diaria: hhmmStrToExcelNumber(f.jornada_diaria),
        adiantamento: parseFloat(f.adiantamento ?? "0") || 0,
        transporte: f.transporte ? "Sim" : "Não",
        vale_alimentacao: f.vale_alimentacao ? "Sim" : "Não",
      });
    });
    funcWs.getColumn("adiantamento").numFmt = '"R$" #,##0.00';
    funcWs.getColumn("jornada_diaria").numFmt = HHMM_NUMFMT;

    const ws = wb.addWorksheet("Registros de Ponto");

    // Layout enxuto: 8 colunas de entrada
    ws.columns = [
      { header: "Data (DD/MM/AAAA)", key: "data", width: 18 },
      { header: "Dia da Semana", key: "dia_semana", width: 16 },
      { header: "Tipo do Dia", key: "tipo_dia", width: 22 },
      { header: "Entrada (HH:MM)", key: "entrada", width: 16 },
      { header: "Saída Almoço (HH:MM)", key: "saida_almoco", width: 20 },
      { header: "Volta Almoço (HH:MM)", key: "volta_almoco", width: 20 },
      { header: "Saída (HH:MM)", key: "saida", width: 16 },
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
        tipo_dia: TIPO_LABEL.normal,
        entrada: null,
        saida_almoco: null,
        volta_almoco: null,
        saida: null,
        observacoes: "",
      });
    });
    for (const colKey of ["entrada", "saida_almoco", "volta_almoco", "saida"]) {
      ws.getColumn(colKey).numFmt = HHMM_NUMFMT;
    }

    // Validação (dropdown) na coluna Tipo do Dia (col C, linhas 2..N+1)
    const tipoLabels = TIPOS_DIA.map((t) => TIPO_LABEL[t]);
    const lastRow = days.length + 1;
    const dvFormula = `"${tipoLabels.join(",")}"`;
    for (let r = 2; r <= lastRow; r++) {
      ws.getCell(`C${r}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [dvFormula],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Tipo inválido",
        error: `Selecione um valor da lista: ${tipoLabels.join(", ")}`,
      };
    }

    const instrWs = wb.addWorksheet("Instruções");
    instrWs.getColumn("A").width = 100;
    const instructions = [
      "INSTRUÇÕES DE PREENCHIMENTO",
      "",
      "1. Data: Use o formato brasileiro DD/MM/AAAA (ex: 01/04/2026). O formato YYYY-MM-DD também é aceito.",
      "2. Tipo do Dia: ESCOLHA da lista suspensa (Normal, Feriado, Feriado Trabalhado, Falta, Falta Justificada, Atraso Justificado).",
      "3. Entrada / Saída Almoço / Volta Almoço / Saída: BASTA DIGITAR OS NÚMEROS (ex: 0800, 1230, 1330, 1730) — as células estão formatadas para mostrar HH:MM automaticamente, o ':' aparece sozinho. Você também pode digitar com ':' (ex: 08:00) se preferir, mas não é necessário. O mesmo vale para a coluna 'Jornada Diária' da aba Funcionários.",
      "4. Observações: Campo livre para texto.",
      "",
      "REGRAS POR TIPO:",
      "• Normal: preencha Entrada/Saída (e Almoço quando houver). HE 60%/100% e Atrasos calculados automaticamente pela jornada.",
      "• Feriado: deixe os horários em branco. Conta como dia trabalhado (jornada padrão), sem HE.",
      "• Feriado Trabalhado: preencha os horários. Todas as horas trabalhadas viram HE 100%.",
      "• Falta: deixe em branco. Conta 1 falta no mês.",
      "• Falta Justificada: deixe em branco. Conta jornada padrão como 'horas justificadas', sem desconto.",
      "• Atraso Justificado: preencha os horários reais. Atraso é zerado, HE só sobre excesso de jornada.",
      "",
      "COMO IMPORTAR:",
      "1. Preencha a aba 'Registros de Ponto' com os dados do mês.",
      "2. Salve o arquivo em formato .xlsx.",
      "3. No sistema, vá para a Folha do Funcionário → Importar Excel.",
      "4. Selecione o arquivo e confirme a importação.",
    ];
    instructions.forEach((text) => {
      const row = instrWs.addRow([text]);
      if (
        text === "INSTRUÇÕES DE PREENCHIMENTO" ||
        text === "COMO IMPORTAR:" ||
        text === "REGRAS POR TIPO:"
      ) {
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

    ws.mergeCells("A1:G1");
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
      { key: "tipo_dia", width: 20 },
      { key: "entrada", width: 12 },
      { key: "saida", width: 12 },
      { key: "saida_almoco", width: 14 },
      { key: "volta_almoco", width: 14 },
    ];

    const headerRow = ws.addRow([
      "Data",
      "Dia da Semana",
      "Tipo do Dia",
      "Entrada",
      "Saída",
      "Saída Almoço",
      "Volta Almoço",
    ]);
    headerRow.eachCell((cell) => Object.assign(cell, { style: HEADER_STYLE }));
    headerRow.height = 22;

    for (const colKey of ["entrada", "saida", "saida_almoco", "volta_almoco"]) {
      ws.getColumn(colKey).numFmt = HHMM_NUMFMT;
    }

    const tipoLabels = TIPOS_DIA.map((t) => TIPO_LABEL[t]);
    const dvFormula = `"${tipoLabels.join(",")}"`;

    days.forEach((data) => {
      const reg = registroMap.get(data);
      const dt = new Date(data + "T00:00:00");
      const isSabado = dt.getDay() === 6;
      const isDomingo = dt.getDay() === 0;
      const tipo: TipoDia = isTipoDia(reg?.tipo_dia) ? reg.tipo_dia : "normal";

      const row = ws.addRow({
        data: isoToBrDate(data),
        dia_semana: getDiaSemana(data),
        tipo_dia: TIPO_LABEL[tipo],
        entrada: hhmmStrToExcelNumber(reg?.entrada),
        saida: hhmmStrToExcelNumber(reg?.saida),
        saida_almoco: hhmmStrToExcelNumber(reg?.saida_almoco),
        volta_almoco: hhmmStrToExcelNumber(reg?.volta_almoco),
      });

      ws.getCell(`C${row.number}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [dvFormula],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Tipo inválido",
        error: `Selecione um valor da lista: ${tipoLabels.join(", ")}`,
      };

      const tipoColor = TIPO_COLOR[tipo];
      if (tipoColor) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: tipoColor },
          };
        });
      } else if (isDomingo) {
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
    // Chaveado por `${dow}-${semana}`. Funcionários sem escala quinzenal só têm semana=1.
    const jornadaByDowSemana = new Map<string, typeof jornadasRows[number]>();
    for (const j of jornadasRows) jornadaByDowSemana.set(`${j.dia_semana}-${j.semana}`, j);
    const pickJornada = (dateStr: string, dow: number) => {
      const semana = funcionario.escala_quinzenal
        ? computeSemanaForDate(dateStr, funcionario.quinzena_referencia ?? null)
        : 1;
      return (
        jornadaByDowSemana.get(`${dow}-${semana}`) ??
        (semana === 2 ? jornadaByDowSemana.get(`${dow}-1`) : undefined)
      );
    };

    const feriadoEmpresaId = empresaId ?? funcionario.empresa_id ?? null;
    const feriadoRows = feriadoEmpresaId !== null
      ? await db.select().from(feriadosTable).where(eq(feriadosTable.empresa_id, feriadoEmpresaId))
      : [];
    const feriadoSet = new Set<string>(feriadoRows.map((f) => String(f.data)));

    type ColMap = {
      tipo: number | null;
      entrada: number | null;
      saidaAlmoco: number | null;
      voltaAlmoco: number | null;
      saida: number | null;
      intervalo: number | null;
      he60: number | null;
      he100: number | null;
      atrasos: number | null;
      faltas: number | null;
      obs: number | null;
    };

    // Detectar a linha de cabeçalho real: a Folha Individual tem título/metadados nas
    // primeiras linhas, então o cabeçalho não está fixo na linha 1.
    const SCAN_ROWS = Math.min(10, ws.rowCount);
    let headerRowNum: number | null = null;
    for (let r = 1; r <= SCAN_ROWS; r++) {
      const row = ws.getRow(r);
      const firstCell = String(row.getCell(1).value ?? "").trim().toLowerCase();
      if (!firstCell.startsWith("data")) continue;
      let hasEntradaOrTipo = false;
      for (let c = 2; c <= row.cellCount; c++) {
        const txt = String(row.getCell(c).value ?? "").trim().toLowerCase();
        if (txt.includes("entrada") || txt.includes("tipo")) {
          hasEntradaOrTipo = true;
          break;
        }
      }
      if (hasEntradaOrTipo) {
        headerRowNum = r;
        break;
      }
    }

    if (headerRowNum === null) {
      res.status(400).json({
        error:
          "Cabeçalho não encontrado. Use o arquivo gerado pelo modelo ou pela exportação da folha individual.",
      });
      return;
    }

    // Mapear colunas pelo nome do cabeçalho (em vez de posição fixa) para
    // suportar layouts diferentes (modelo novo, modelo antigo, folha individual).
    const headerRow = ws.getRow(headerRowNum);
    const COL: ColMap = {
      tipo: null,
      entrada: null,
      saidaAlmoco: null,
      voltaAlmoco: null,
      saida: null,
      intervalo: null,
      he60: null,
      he100: null,
      atrasos: null,
      faltas: null,
      obs: null,
    };
    for (let c = 1; c <= headerRow.cellCount; c++) {
      const txt = String(headerRow.getCell(c).value ?? "").trim().toLowerCase();
      if (!txt) continue;
      if (txt.includes("tipo") && txt.includes("dia")) COL.tipo = c;
      else if (txt.startsWith("entrada")) COL.entrada = c;
      else if (txt.startsWith("saída almoço") || txt.startsWith("saida almoco")) COL.saidaAlmoco = c;
      else if (txt.startsWith("volta almoço") || txt.startsWith("volta almoco")) COL.voltaAlmoco = c;
      else if (txt.startsWith("saída") || txt.startsWith("saida")) COL.saida = c;
      else if (txt.startsWith("intervalo")) COL.intervalo = c;
      else if (txt.startsWith("he 60") || txt.startsWith("he60")) COL.he60 = c;
      else if (txt.startsWith("he 100") || txt.startsWith("he100")) COL.he100 = c;
      else if (txt.startsWith("atraso")) COL.atrasos = c;
      else if (txt.startsWith("falta")) COL.faltas = c;
      else if (txt.startsWith("observ") || txt.startsWith("obs")) COL.obs = c;
    }

    if (COL.entrada === null || COL.saida === null) {
      res.status(400).json({
        error:
          "Cabeçalho não encontrado. Use o arquivo gerado pelo modelo ou pela exportação da folha individual.",
      });
      return;
    }

    const isNewLayout = COL.tipo !== null;

    const rows = ws.getRows(headerRowNum + 1, Math.max(ws.rowCount - headerRowNum, 0)) ?? [];

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

      // Para colunas de horário: trata também valores numéricos vindos
      // do formato customizado 00":"00 (ex.: 800 -> "800") e Excel time
      // como fração-de-dia (0..1, ex.: 08:00 = 0.3333).
      const cellToTimeStr = (col: number | null): string | null => {
        if (col === null) return null;
        const v = row.getCell(col).value;
        if (v === null || v === undefined) return null;
        if (typeof v === "number") {
          if (v > 0 && v < 1) {
            const totalMin = Math.round(v * 24 * 60);
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          }
          return String(Math.round(v));
        }
        if (v instanceof Date) {
          const h = v.getUTCHours();
          const m = v.getUTCMinutes();
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        }
        const s = String(v).trim();
        return s || null;
      };

      const entrada = normalizeHHMM(cellToTimeStr(COL.entrada));
      const saida = normalizeHHMM(cellToTimeStr(COL.saida));
      const saidaAlmoco = normalizeHHMM(cellToTimeStr(COL.saidaAlmoco));
      const voltaAlmoco = normalizeHHMM(cellToTimeStr(COL.voltaAlmoco));
      const intervaloRaw = normalizeHHMM(cellToTimeStr(COL.intervalo));
      const observacoes = getCellStr(COL.obs);

      // Resolver tipo_dia
      let tipo: TipoDia;
      const tipoRaw = getCellStr(COL.tipo);
      if (isNewLayout) {
        const parsed = parseTipoDia(tipoRaw);
        if (!parsed) {
          erros.push(`Linha ${row.number} (${dataRaw}): Tipo do Dia inválido "${tipoRaw ?? ""}"`);
          continue;
        }
        tipo = parsed;
      } else {
        // Compat layout antigo: derivar de faltas/observações sem suporte a justificativa
        const faltasVal = COL.faltas !== null ? row.getCell(COL.faltas).value : null;
        const faltasNum = faltasVal !== null && faltasVal !== undefined
          ? parseFloat(String(faltasVal).replace(",", ".")) || 0
          : 0;
        if (faltasNum >= 1) {
          tipo = "falta";
        } else if (entrada && saida) {
          tipo = "normal";
        } else {
          tipo = "normal";
        }
      }

      // Tipos sem horários: aceitar células em branco
      const isNoTime = tipo === "feriado" || tipo === "falta" || tipo === "falta_justificada";

      if (!isNoTime) {
        if (!entrada && !saida) {
          // linha em branco — pular silenciosamente
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

      const dow = getDiaSemanaNum(dataStr);
      const jornadaDoDia = pickJornada(dataStr, dow);
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

      const intervaloDerivado = deriveIntervalo(saidaAlmoco, voltaAlmoco);
      const intervaloFinal = intervaloDerivado ?? intervaloRaw ?? jornadaDoDia?.intervalo_padrao ?? null;

      const calc = calcFromTipoDia({
        tipo,
        entrada,
        saida,
        intervalo: intervaloFinal,
        jornada: jornadaInfo,
        dateStr: dataStr,
        jornadaDiariaFallback: funcionario.jornada_diaria,
        he100AcimaDe2h: funcionario.he_100_acima_2h ?? true,
      });
      const mirror = legacyMirrorFromTipo(tipo, calc.faltas);

      const existing = await db
        .select()
        .from(registrosPontoTable)
        .where(
          and(
            eq(registrosPontoTable.funcionario_id, funcionarioId),
            eq(registrosPontoTable.data, dataStr),
          ),
        );

      const dataToSave = {
        empresa_id: funcionario.empresa_id ?? empresaId ?? null,
        funcionario_id: funcionarioId,
        data: dataStr,
        entrada: isNoTime ? null : entrada,
        saida: isNoTime ? null : saida,
        saida_almoco: isNoTime ? null : saidaAlmoco,
        volta_almoco: isNoTime ? null : voltaAlmoco,
        intervalo: isNoTime ? null : intervaloFinal,
        total_horas: calc.total_horas,
        he_60: calc.he_60,
        he_100: calc.he_100,
        atrasos: calc.atrasos,
        faltas: mirror.faltas,
        observacoes,
        justificativa: mirror.justificativa,
        horas_justificadas: calc.horas_justificadas,
        tipo_dia: tipo,
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
