/**
 * Normaliza uma string que representa um horário no formato `HH:MM`,
 * aceitando também valores apenas com dígitos (sem `:`).
 *
 * Exemplos:
 *   "08:00" -> "08:00"
 *   "8:00"  -> "08:00"
 *   "0800"  -> "08:00"
 *   "800"   -> "08:00"
 *   "8"     -> "08:00"
 *   "17"    -> "17:00"
 *   ""      -> null
 *   null    -> null
 *
 * Retorna a string original quando o formato não puder ser identificado,
 * para que a validação posterior possa rejeitá-la.
 */
export function normalizeHHMM(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length !== 2) return s;
    const hRaw = parts[0] ?? "";
    const mRaw = parts[1] ?? "";
    if (!/^\d{1,2}$/.test(hRaw) || !/^\d{1,2}$/.test(mRaw)) return s;
    return `${hRaw.padStart(2, "0")}:${mRaw.padStart(2, "0")}`;
  }
  if (!/^\d+$/.test(s)) return s;
  if (s.length <= 2) return `${s.padStart(2, "0")}:00`;
  if (s.length === 3) return `0${s[0]}:${s.slice(1)}`;
  if (s.length === 4) return `${s.slice(0, 2)}:${s.slice(2)}`;
  return s;
}

export function timeToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  const parts = time.split(":");
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  if (minutes < 0) minutes = 0;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function calcTotalHoras(
  entrada: string | null | undefined,
  saida: string | null | undefined,
  intervalo: string | null | undefined,
  jornadaMinutes = 480,
): {
  total_horas: string | null;
} {
  if (!entrada || !saida) return { total_horas: null };
  const entradaMin = timeToMinutes(entrada);
  const saidaMin = timeToMinutes(saida);
  const intervaloMin = timeToMinutes(intervalo);
  let totalMin = saidaMin - entradaMin - intervaloMin;
  if (totalMin < 0) totalMin = 0;
  return { total_horas: minutesToTime(totalMin) };
}

export function calcHEAndAtrasos(
  entrada: string | null | undefined,
  saida: string | null | undefined,
  intervalo: string | null | undefined,
  jornadaDiaria: string | null | undefined,
  dateStr: string,
): {
  he_60: string | null;
  he_100: string | null;
  atrasos: string | null;
} {
  if (!entrada || !saida) {
    return { he_60: null, he_100: null, atrasos: null };
  }
  const entradaMin = timeToMinutes(entrada);
  const saidaMin = timeToMinutes(saida);
  const intervaloMin = timeToMinutes(intervalo);
  let totalMin = saidaMin - entradaMin - intervaloMin;
  if (totalMin < 0) totalMin = 0;

  const jornadaMin = timeToMinutes(jornadaDiaria) || 480;
  const isFeriado = isDomFeriado(dateStr);

  if (isFeriado) {
    return {
      he_60: "00:00",
      he_100: minutesToTime(totalMin),
      atrasos: "00:00",
    };
  }

  const extraMin = Math.max(totalMin - jornadaMin, 0);
  const he60Min = Math.min(extraMin, 120);
  const he100Min = Math.max(extraMin - 120, 0);
  const atrasosMin = totalMin < jornadaMin ? jornadaMin - totalMin : 0;

  return {
    he_60: minutesToTime(he60Min),
    he_100: minutesToTime(he100Min),
    atrasos: minutesToTime(atrasosMin),
  };
}

export interface JornadaDia {
  entrada_padrao: string | null;
  saida_padrao: string | null;
  intervalo_padrao: string | null;
  is_folga: boolean;
}

export interface CalcResult {
  total_horas: string | null;
  he_60: string | null;
  he_100: string | null;
  atrasos: string | null;
  faltas: string;
  intervalo_used: string | null;
  horas_justificadas: string | null;
}

export type Justificativa = "nenhuma" | "justificada" | "injustificada";

export type TipoDia =
  | "normal"
  | "feriado"
  | "feriado_trabalhado"
  | "falta"
  | "falta_justificada"
  | "atraso_justificado";

export const TIPOS_DIA: TipoDia[] = [
  "normal",
  "feriado",
  "feriado_trabalhado",
  "falta",
  "falta_justificada",
  "atraso_justificado",
];

export function isTipoDia(v: unknown): v is TipoDia {
  return typeof v === "string" && (TIPOS_DIA as string[]).includes(v);
}

export interface CalcFromTipoDiaArgs {
  tipo: TipoDia;
  entrada: string | null | undefined;
  saida: string | null | undefined;
  intervalo: string | null | undefined;
  jornada: JornadaDia | null | undefined;
  dateStr: string;
  jornadaDiariaFallback?: string | null | undefined;
}

/**
 * Cálculo único e centralizado por Tipo do Dia.
 * Substitui calcFromJornada/calcHEAndAtrasos quando o caller já sabe o tipo.
 */
export function calcFromTipoDia(args: CalcFromTipoDiaArgs): CalcResult {
  const { tipo, entrada, saida, intervalo, jornada, jornadaDiariaFallback } = args;

  const intervaloUsed = intervalo || jornada?.intervalo_padrao || null;
  const fallbackMin = timeToMinutes(jornadaDiariaFallback) || 480;
  const jornadaMin = jornada && jornada.entrada_padrao && jornada.saida_padrao
    ? calcJornadaNetMin(jornada)
    : fallbackMin;

  const trabalhadasMin = entrada && saida
    ? Math.max(timeToMinutes(saida) - timeToMinutes(entrada) - timeToMinutes(intervaloUsed), 0)
    : 0;

  switch (tipo) {
    case "feriado": {
      return {
        total_horas: minutesToTime(jornadaMin),
        he_60: "00:00",
        he_100: "00:00",
        atrasos: "00:00",
        faltas: "0",
        intervalo_used: intervaloUsed,
        horas_justificadas: "00:00",
      };
    }
    case "feriado_trabalhado": {
      return {
        total_horas: minutesToTime(trabalhadasMin),
        he_60: "00:00",
        he_100: minutesToTime(trabalhadasMin),
        atrasos: "00:00",
        faltas: "0",
        intervalo_used: intervaloUsed,
        horas_justificadas: "00:00",
      };
    }
    case "falta": {
      return {
        total_horas: "00:00",
        he_60: "00:00",
        he_100: "00:00",
        atrasos: "00:00",
        faltas: "1",
        intervalo_used: intervaloUsed,
        horas_justificadas: "00:00",
      };
    }
    case "falta_justificada": {
      const horasJustMin = Math.max(jornadaMin - trabalhadasMin, 0);
      return {
        total_horas: minutesToTime(jornadaMin),
        he_60: "00:00",
        he_100: "00:00",
        atrasos: "00:00",
        faltas: "0",
        intervalo_used: intervaloUsed,
        horas_justificadas: minutesToTime(horasJustMin),
      };
    }
    case "atraso_justificado": {
      const extraMin = Math.max(trabalhadasMin - jornadaMin, 0);
      return {
        total_horas: minutesToTime(trabalhadasMin),
        he_60: minutesToTime(Math.min(extraMin, 120)),
        he_100: minutesToTime(Math.max(extraMin - 120, 0)),
        atrasos: "00:00",
        faltas: "0",
        intervalo_used: intervaloUsed,
        horas_justificadas: "00:00",
      };
    }
    case "normal":
    default: {
      if (!entrada || !saida) {
        return {
          total_horas: null,
          he_60: null,
          he_100: null,
          atrasos: null,
          faltas: "0",
          intervalo_used: intervaloUsed,
          horas_justificadas: null,
        };
      }
      const extraMin = Math.max(trabalhadasMin - jornadaMin, 0);
      let atrasoMin = 0;
      if (jornada?.entrada_padrao && entrada > jornada.entrada_padrao) {
        atrasoMin = Math.max(timeToMinutes(entrada) - timeToMinutes(jornada.entrada_padrao), 0);
      }
      const atrasosMin = trabalhadasMin < jornadaMin ? jornadaMin - trabalhadasMin : atrasoMin;
      return {
        total_horas: minutesToTime(trabalhadasMin),
        he_60: minutesToTime(Math.min(extraMin, 120)),
        he_100: minutesToTime(Math.max(extraMin - 120, 0)),
        atrasos: minutesToTime(Math.max(atrasosMin, 0)),
        faltas: "0",
        intervalo_used: intervaloUsed,
        horas_justificadas: null,
      };
    }
  }
}

/**
 * Mantém os campos legados `justificativa` e `faltas` em sincronia com `tipo_dia`,
 * para clientes/integrações que ainda lêem o schema antigo.
 */
export function legacyMirrorFromTipo(tipo: TipoDia, calcFaltas: string): {
  justificativa: Justificativa;
  faltas: string;
} {
  switch (tipo) {
    case "falta_justificada":
    case "atraso_justificado":
      return { justificativa: "justificada", faltas: "0" };
    case "falta":
      return { justificativa: "injustificada", faltas: "1" };
    default:
      return { justificativa: "nenhuma", faltas: calcFaltas ?? "0" };
  }
}

/**
 * Inverso do mirror: usado durante a transição quando o cliente envia apenas
 * justificativa+faltas (sem tipo_dia).
 */
export function tipoFromLegacy(
  justificativa: Justificativa | null | undefined,
  faltas: string | number | null | undefined,
  hasHorasTrabalhadas: boolean,
  isDomingoOuFeriado: boolean,
): TipoDia {
  if (justificativa === "justificada") {
    return hasHorasTrabalhadas ? "atraso_justificado" : "falta_justificada";
  }
  const faltasNum = typeof faltas === "number" ? faltas : parseFloat(String(faltas ?? "0"));
  if (faltasNum >= 1 && !hasHorasTrabalhadas) return "falta";
  if (isDomingoOuFeriado) {
    return hasHorasTrabalhadas ? "feriado_trabalhado" : "feriado";
  }
  // Compat: dia útil sem horas registradas é tratado como falta (comportamento legado).
  if (!hasHorasTrabalhadas) return "falta";
  return "normal";
}

export function calcFromJornada(
  entrada: string | null | undefined,
  saida: string | null | undefined,
  intervalo: string | null | undefined,
  jornada: JornadaDia | null | undefined,
  dateStr: string,
  justificativa: Justificativa | null | undefined = "nenhuma",
  jornadaDiariaFallback: string | null | undefined = null,
): CalcResult {
  const isFeriado = isDomFeriado(dateStr);
  const isFolga = isFeriado || (jornada?.is_folga ?? false);

  const intervaloUsed = intervalo || jornada?.intervalo_padrao || null;

  const fallbackMin = timeToMinutes(jornadaDiariaFallback) || 480;
  const jornadaMinFromDay = jornada && jornada.entrada_padrao && jornada.saida_padrao
    ? calcJornadaNetMin(jornada)
    : fallbackMin;

  if (justificativa === "justificada") {
    const trabalhadasMin = entrada && saida
      ? Math.max(timeToMinutes(saida) - timeToMinutes(entrada) - timeToMinutes(intervaloUsed), 0)
      : 0;
    const horasJustMin = Math.max(jornadaMinFromDay - trabalhadasMin, 0);
    return {
      total_horas: minutesToTime(jornadaMinFromDay),
      he_60: "00:00",
      he_100: "00:00",
      atrasos: "00:00",
      faltas: "0",
      intervalo_used: intervaloUsed,
      horas_justificadas: minutesToTime(horasJustMin),
    };
  }

  if (!entrada || !saida) {
    if (isFolga) {
      return { total_horas: null, he_60: null, he_100: null, atrasos: null, faltas: "0", intervalo_used: intervaloUsed, horas_justificadas: null };
    }
    return { total_horas: null, he_60: null, he_100: null, atrasos: null, faltas: "1", intervalo_used: intervaloUsed, horas_justificadas: null };
  }

  const entradaMin = timeToMinutes(entrada);
  const saidaMin = timeToMinutes(saida);
  const intervaloMin = timeToMinutes(intervaloUsed);
  let totalMin = saidaMin - entradaMin - intervaloMin;
  if (totalMin < 0) totalMin = 0;

  if (isFolga) {
    return {
      total_horas: minutesToTime(totalMin),
      he_60: "00:00",
      he_100: minutesToTime(totalMin),
      atrasos: "00:00",
      faltas: "0",
      intervalo_used: intervaloUsed,
      horas_justificadas: null,
    };
  }

  const jornadaMin = jornadaMinFromDay;

  let atrasoMin = 0;
  if (jornada?.entrada_padrao && entrada > jornada.entrada_padrao) {
    const expectedEntradaMin = timeToMinutes(jornada.entrada_padrao);
    atrasoMin = Math.max(entradaMin - expectedEntradaMin, 0);
  }

  const extraMin = Math.max(totalMin - jornadaMin, 0);
  const he60Min = Math.min(extraMin, 120);
  const he100Min = Math.max(extraMin - 120, 0);
  const atrasosMin = totalMin < jornadaMin ? jornadaMin - totalMin : atrasoMin;

  return {
    total_horas: minutesToTime(totalMin),
    he_60: minutesToTime(he60Min),
    he_100: minutesToTime(he100Min),
    atrasos: minutesToTime(Math.max(atrasosMin, 0)),
    faltas: "0",
    intervalo_used: intervaloUsed,
    horas_justificadas: null,
  };
}

function calcJornadaNetMin(jornada: JornadaDia): number {
  if (!jornada.entrada_padrao || !jornada.saida_padrao) return 480;
  const net = timeToMinutes(jornada.saida_padrao) - timeToMinutes(jornada.entrada_padrao) - timeToMinutes(jornada.intervalo_padrao);
  return net > 0 ? net : 480;
}

export function addTimes(times: (string | null | undefined)[]): string {
  const total = times.reduce((acc, t) => acc + timeToMinutes(t), 0);
  return minutesToTime(total);
}

export function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function getDiaSemana(dateStr: string): string {
  const days = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];
  const d = new Date(dateStr + "T00:00:00");
  return days[d.getDay()] ?? "";
}

export function getDiaSemanaNum(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay();
}

/**
 * Para um funcionário com escala quinzenal, decide se uma data cai na
 * Semana A (1) ou Semana B (2). A Semana A é definida como aquela em que cai
 * `referenciaDateStr` (a data de referência informada no cadastro). A semana
 * é calculada pela segunda-feira ISO da data: dois dias caem na MESMA semana
 * quando suas segundas-feiras são iguais; senão, alterna a cada semana.
 *
 * Sem `referenciaDateStr`, sempre retorna 1 (mantém compat).
 */
export function computeSemanaForDate(
  dateStr: string,
  referenciaDateStr: string | null | undefined,
): 1 | 2 {
  if (!referenciaDateStr) return 1;
  const target = mondayOfIsoWeek(dateStr);
  const ref = mondayOfIsoWeek(referenciaDateStr);
  if (!target || !ref) return 1;
  const diffDays = Math.round((target.getTime() - ref.getTime()) / 86400000);
  const weeks = Math.floor(diffDays / 7);
  // weeks par → mesma semana da referência (Semana A); ímpar → Semana B.
  // Math.floor garante que weeks negativos (data antes da referência) também alternem corretamente.
  return ((weeks % 2) + 2) % 2 === 0 ? 1 : 2;
}

function mondayOfIsoWeek(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const y = parseInt(m[1] ?? "0", 10);
  const mo = parseInt(m[2] ?? "0", 10);
  const da = parseInt(m[3] ?? "0", 10);
  const d = new Date(y, mo - 1, da);
  // getDay(): 0=Dom, 1=Seg, ..., 6=Sab. Queremos andar pra trás até a segunda.
  const dow = d.getDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offsetToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    const iso = d.toISOString().split("T")[0]!;
    days.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function parseMes(mes: string): { year: number; month: number } {
  const [yearStr, monthStr] = mes.split("-");
  return {
    year: parseInt(yearStr ?? "2025", 10),
    month: parseInt(monthStr ?? "1", 10),
  };
}

export function getCurrentTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function getCurrentDateStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

function calcEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function getFeriadosNacionais(year: number): Set<string> {
  const fixed = [
    `${year}-01-01`,
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-11-20`,
    `${year}-12-25`,
  ];

  const easter = calcEasterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const corpusChristi = new Date(easter);
  corpusChristi.setDate(easter.getDate() + 60);

  const variable = [goodFriday, corpusChristi].map(
    (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
  );

  return new Set([...fixed, ...variable]);
}

export function isDomFeriado(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  if (d.getDay() === 0) return true;
  const year = d.getFullYear();
  return getFeriadosNacionais(year).has(dateStr);
}

export function deriveIntervalo(
  saidaAlmoco: string | null | undefined,
  voltaAlmoco: string | null | undefined,
): string | null {
  if (!saidaAlmoco || !voltaAlmoco) return null;
  const ini = timeToMinutes(saidaAlmoco);
  const fim = timeToMinutes(voltaAlmoco);
  const diff = fim - ini;
  if (diff <= 0) return null;
  return minutesToTime(diff);
}

export function isoToBrDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function brToIsoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}
