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

const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === "") return BRL_FORMATTER.format(0);
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (!Number.isFinite(num)) return BRL_FORMATTER.format(0);
  return BRL_FORMATTER.format(num);
}

export function baseUrl(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

const AUTH_TOKEN_KEY = "ponto.auth.token";
const ACTIVE_EMPRESA_KEY = "ponto.auth.activeEmpresaId";

function readAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function readActiveEmpresaId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_EMPRESA_KEY);
  } catch {
    return null;
  }
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = readAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const empresaId = readActiveEmpresaId();
  if (empresaId) headers["X-Empresa-Id"] = empresaId;
  return headers;
}

/**
 * Download a file from an authenticated API endpoint as a blob and trigger
 * a browser download.  Replaces `window.open(...)` for protected routes
 * since `window.open` cannot attach an `Authorization` header.
 */
export async function downloadAuthenticatedFile(path: string, suggestedName?: string): Promise<void> {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = (data?.error as string) ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Falha ao baixar arquivo (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  if (suggestedName) {
    anchor.download = suggestedName;
  } else {
    const disp = res.headers.get("content-disposition") ?? "";
    const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disp);
    anchor.download = decodeURIComponent(match?.[1] ?? match?.[2] ?? "download");
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
