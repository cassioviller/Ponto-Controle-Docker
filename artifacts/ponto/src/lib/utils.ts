import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMes(mes: string): string {
  const [year, month] = mes.split("-");
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const m = parseInt(month ?? "1", 10);
  return `${months[m - 1] ?? ""} ${year}`;
}

export function getCurrentMes(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function getMonthOptions(count = 12): Array<{ value: string; label: string }> {
  const opts = [];
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  for (let i = 0; i < count; i++) {
    const val = `${year}-${String(month).padStart(2, "0")}`;
    opts.push({ value: val, label: formatMes(val) });
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
  }
  return opts;
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return "--:--";
  return t;
}

export function baseUrl(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}
