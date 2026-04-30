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
  const dt = new Date(dateStr + "T00:00:00");
  const isDomingo = dt.getDay() === 0;

  if (isDomingo) {
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
