import { useState, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetRegistrosFuncionario,
  useUpsertRegistro,
  getGetRegistrosFuncionarioQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatMes, getCurrentMes, getMonthOptions, baseUrl, authHeaders, downloadAuthenticatedFile } from "@/lib/utils";
import type { FolhaMensal, RegistroPonto } from "@workspace/api-client-react";

type JornadaPadrao = {
  entrada_padrao: string | null;
  saida_padrao: string | null;
  intervalo_padrao: string | null;
  is_folga: boolean;
} | null;

type FolhaRegistro = RegistroPonto & {
  dia_semana?: string;
  jornada_padrao?: JornadaPadrao;
};

interface EditRow extends Partial<RegistroPonto> {
  data: string;
  dia_semana?: string;
  jornada_padrao?: JornadaPadrao;
}

type FolhaMensalEx = Omit<FolhaMensal, "registros"> & { registros: FolhaRegistro[] };

function timeToMinutes(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToTime(m: number): string {
  if (m < 0) m = 0;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function isDomFeriado(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  if (d.getDay() === 0) return true;
  const year = d.getFullYear();
  const easter = calcEaster(year);
  const gf = new Date(easter); gf.setDate(easter.getDate() - 2);
  const cc = new Date(easter); cc.setDate(easter.getDate() + 60);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const feriados = new Set([
    `${year}-01-01`, `${year}-04-21`, `${year}-05-01`, `${year}-09-07`,
    `${year}-10-12`, `${year}-11-02`, `${year}-11-15`, `${year}-11-20`, `${year}-12-25`,
    fmt(gf), fmt(cc),
  ]);
  return feriados.has(dateStr);
}

function calcEaster(year: number): Date {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day);
}

function deriveIntervalo(saidaAlmoco: string | null | undefined, voltaAlmoco: string | null | undefined): string | null {
  if (!saidaAlmoco || !voltaAlmoco) return null;
  const ini = timeToMinutes(saidaAlmoco);
  const fim = timeToMinutes(voltaAlmoco);
  const diff = fim - ini;
  if (diff <= 0) return null;
  return minutesToTime(diff);
}

function isoToBrDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

type TipoDia =
  | "normal"
  | "feriado"
  | "feriado_trabalhado"
  | "falta"
  | "falta_justificada"
  | "atraso_justificado";

const TIPO_DIA_LABEL: Record<TipoDia, string> = {
  normal: "Normal",
  feriado: "Feriado (não trabalhado)",
  feriado_trabalhado: "Feriado Trabalhado",
  falta: "Falta",
  falta_justificada: "Falta Justificada",
  atraso_justificado: "Atraso Justificado",
};

const TIPO_DIA_BANNER: Record<TipoDia, string> = {
  normal: "Cálculo padrão pela jornada do dia. Horas além da jornada viram HE 60% (até 2h) e HE 100% (acima).",
  feriado: "Dia não trabalhado. Conta como jornada padrão. Sem HE, sem atraso, sem falta.",
  feriado_trabalhado: "Todas as horas trabalhadas viram HE 100%. Sem atraso, sem desconto.",
  falta: "Conta 1 falta no mês. Total / HE / Atrasos = 0.",
  falta_justificada: "Sem desconto. Total = jornada padrão. As horas não trabalhadas viram 'horas justificadas'.",
  atraso_justificado: "Atrasos zerados. HE só sobre o excesso da jornada.",
};

const TIPOS_SEM_HORARIO = new Set<TipoDia>(["feriado", "falta", "falta_justificada"]);

function jornadaNetMin(jornada: JornadaPadrao, jornadaDiariaFallback?: string | null): number {
  if (jornada?.entrada_padrao && jornada?.saida_padrao) {
    const net = timeToMinutes(jornada.saida_padrao) - timeToMinutes(jornada.entrada_padrao) - timeToMinutes(jornada.intervalo_padrao);
    if (net > 0) return net;
  }
  return timeToMinutes(jornadaDiariaFallback ?? null) || 480;
}

function calcByTipo(
  tipo: TipoDia,
  entrada: string | null | undefined,
  saida: string | null | undefined,
  intervalo: string | null | undefined,
  jornada: JornadaPadrao,
  jornadaDiariaFallback: string | null = null,
): { total_horas: string | null; he_60: string | null; he_100: string | null; atrasos: string | null; faltas: string; intervalo_used: string | null; horas_justificadas: string | null } {
  const intervaloUsed = intervalo || jornada?.intervalo_padrao || null;
  const jornadaMin = jornadaNetMin(jornada, jornadaDiariaFallback);

  const trabMin = entrada && saida
    ? Math.max(timeToMinutes(saida) - timeToMinutes(entrada) - timeToMinutes(intervaloUsed), 0)
    : 0;

  if (tipo === "falta") {
    return { total_horas: "00:00", he_60: "00:00", he_100: "00:00", atrasos: "00:00", faltas: "1", intervalo_used: null, horas_justificadas: "00:00" };
  }
  if (tipo === "feriado") {
    return { total_horas: minutesToTime(jornadaMin), he_60: "00:00", he_100: "00:00", atrasos: "00:00", faltas: "0", intervalo_used: null, horas_justificadas: "00:00" };
  }
  if (tipo === "feriado_trabalhado") {
    return { total_horas: minutesToTime(trabMin), he_60: "00:00", he_100: minutesToTime(trabMin), atrasos: "00:00", faltas: "0", intervalo_used: intervaloUsed, horas_justificadas: "00:00" };
  }
  if (tipo === "falta_justificada") {
    const horasJustMin = Math.max(jornadaMin - trabMin, 0);
    return { total_horas: minutesToTime(jornadaMin), he_60: "00:00", he_100: "00:00", atrasos: "00:00", faltas: "0", intervalo_used: intervaloUsed, horas_justificadas: minutesToTime(horasJustMin) };
  }
  if (tipo === "atraso_justificado") {
    const extraMin = Math.max(trabMin - jornadaMin, 0);
    const he60Min = Math.min(extraMin, 120);
    const he100Min = Math.max(extraMin - 120, 0);
    return { total_horas: minutesToTime(trabMin), he_60: minutesToTime(he60Min), he_100: minutesToTime(he100Min), atrasos: "00:00", faltas: "0", intervalo_used: intervaloUsed, horas_justificadas: "00:00" };
  }

  // normal
  if (!entrada || !saida) {
    return { total_horas: null, he_60: null, he_100: null, atrasos: null, faltas: "0", intervalo_used: intervaloUsed, horas_justificadas: null };
  }
  const extraMin = Math.max(trabMin - jornadaMin, 0);
  const he60Min = Math.min(extraMin, 120);
  const he100Min = Math.max(extraMin - 120, 0);
  const atrasosMin = trabMin < jornadaMin ? jornadaMin - trabMin : 0;
  return {
    total_horas: minutesToTime(trabMin),
    he_60: minutesToTime(he60Min),
    he_100: minutesToTime(he100Min),
    atrasos: minutesToTime(atrasosMin),
    faltas: "0",
    intervalo_used: intervaloUsed,
    horas_justificadas: null,
  };
}

function defaultTipoForDate(dateStr: string, jornada: JornadaPadrao): TipoDia {
  if (isDomFeriado(dateStr)) return "feriado";
  if (jornada?.is_folga) return "feriado";
  return "normal";
}

export default function FolhaIndividual() {
  const { id } = useParams<{ id: string }>();
  const [mes, setMes] = useState(getCurrentMes());
  const [, navigate] = useLocation();
  const monthOptions = getMonthOptions();
  const qc = useQueryClient();

  const numId = parseInt(id ?? "0", 10);

  const { data, isLoading, refetch } = useGetRegistrosFuncionario(
    numId,
    { mes },
    {
      query: {
        enabled: !!numId,
        queryKey: getGetRegistrosFuncionarioQueryKey(numId, { mes }),
      },
    },
  );

  const folha = data as FolhaMensalEx | undefined;
  const upsert = useUpsertRegistro();

  const [editingRow, setEditingRow] = useState<EditRow | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ importados: number; erros: string[] } | null>(null);
  const [showImport, setShowImport] = useState(false);

  function handleEdit(reg: FolhaRegistro) {
    setEditingRow({ ...reg });
  }

  function handleEditFieldChange(key: keyof EditRow, value: string | null) {
    setEditingRow((prev) => {
      if (!prev) return null;
      const updated = { ...prev, [key]: value || null };

      if (
        key === "entrada" ||
        key === "saida" ||
        key === "saida_almoco" ||
        key === "volta_almoco"
      ) {
        const nextSaidaAlmoco = key === "saida_almoco" ? (value || null) : (prev.saida_almoco ?? null);
        const nextVoltaAlmoco = key === "volta_almoco" ? (value || null) : (prev.volta_almoco ?? null);
        const intervaloDerivado = deriveIntervalo(nextSaidaAlmoco, nextVoltaAlmoco);
        const tipo = (prev.tipo_dia as TipoDia | undefined) ?? "normal";

        const calc = calcByTipo(
          tipo,
          key === "entrada" ? value : prev.entrada,
          key === "saida" ? value : prev.saida,
          intervaloDerivado,
          prev.jornada_padrao ?? null,
          folha?.funcionario?.jornada_diaria ?? null,
        );
        return {
          ...updated,
          total_horas: calc.total_horas,
          he_60: calc.he_60,
          he_100: calc.he_100,
          atrasos: calc.atrasos,
          faltas: calc.faltas,
          horas_justificadas: calc.horas_justificadas,
          intervalo: intervaloDerivado,
        };
      }

      return updated;
    });
  }

  function handleTipoDiaChange(value: TipoDia) {
    setEditingRow((prev) => {
      if (!prev) return null;
      const noTime = TIPOS_SEM_HORARIO.has(value);
      const entrada = noTime ? null : prev.entrada;
      const saida = noTime ? null : prev.saida;
      const saidaAlmoco = noTime ? null : prev.saida_almoco;
      const voltaAlmoco = noTime ? null : prev.volta_almoco;
      const intervaloDerivado = noTime
        ? null
        : (deriveIntervalo(saidaAlmoco ?? null, voltaAlmoco ?? null) ?? prev.intervalo ?? null);

      const calc = calcByTipo(
        value,
        entrada,
        saida,
        intervaloDerivado,
        prev.jornada_padrao ?? null,
        folha?.funcionario?.jornada_diaria ?? null,
      );
      return {
        ...prev,
        tipo_dia: value,
        entrada,
        saida,
        saida_almoco: saidaAlmoco,
        volta_almoco: voltaAlmoco,
        intervalo: intervaloDerivado,
        total_horas: calc.total_horas,
        he_60: calc.he_60,
        he_100: calc.he_100,
        atrasos: calc.atrasos,
        faltas: calc.faltas,
        horas_justificadas: calc.horas_justificadas,
      };
    });
  }

  function handlePreencherPadrao() {
    setEditingRow((prev) => {
      if (!prev) return null;
      const entradaP = prev.jornada_padrao?.entrada_padrao ?? null;
      const saidaP = prev.jornada_padrao?.saida_padrao ?? null;
      if (!entradaP || !saidaP) return prev;
      const intervaloP = prev.jornada_padrao?.intervalo_padrao ?? null;
      let saidaAlmoco: string | null = null;
      let voltaAlmoco: string | null = null;
      if (intervaloP) {
        // Centra o intervalo no meio da jornada
        const eMin = timeToMinutes(entradaP);
        const sMin = timeToMinutes(saidaP);
        const iMin = timeToMinutes(intervaloP);
        if (sMin > eMin && iMin > 0 && iMin < (sMin - eMin)) {
          const meio = Math.floor((eMin + sMin) / 2);
          const sa = meio - Math.floor(iMin / 2);
          const va = sa + iMin;
          saidaAlmoco = minutesToTime(sa);
          voltaAlmoco = minutesToTime(va);
        }
      }
      const tipo = (prev.tipo_dia as TipoDia | undefined) ?? "normal";
      const calc = calcByTipo(
        tipo,
        entradaP,
        saidaP,
        intervaloP,
        prev.jornada_padrao ?? null,
        folha?.funcionario?.jornada_diaria ?? null,
      );
      return {
        ...prev,
        entrada: entradaP,
        saida: saidaP,
        saida_almoco: saidaAlmoco,
        volta_almoco: voltaAlmoco,
        intervalo: intervaloP,
        total_horas: calc.total_horas,
        he_60: calc.he_60,
        he_100: calc.he_100,
        atrasos: calc.atrasos,
        faltas: calc.faltas,
        horas_justificadas: calc.horas_justificadas,
      };
    });
  }

  function handleLimparHorarios() {
    setEditingRow((prev) => {
      if (!prev) return null;
      const tipo = (prev.tipo_dia as TipoDia | undefined) ?? "normal";
      const calc = calcByTipo(
        tipo,
        null,
        null,
        null,
        prev.jornada_padrao ?? null,
        folha?.funcionario?.jornada_diaria ?? null,
      );
      return {
        ...prev,
        entrada: null,
        saida: null,
        saida_almoco: null,
        volta_almoco: null,
        intervalo: null,
        total_horas: calc.total_horas,
        he_60: calc.he_60,
        he_100: calc.he_100,
        atrasos: calc.atrasos,
        faltas: calc.faltas,
        horas_justificadas: calc.horas_justificadas,
      };
    });
  }

  async function handleSave() {
    if (!editingRow || !numId) return;
    setSaving(true);
    try {
      const tipo = (editingRow.tipo_dia as TipoDia | undefined) ?? "normal";
      await upsert.mutateAsync({
        data: {
          funcionario_id: numId,
          data: editingRow.data,
          entrada: editingRow.entrada ?? null,
          saida: editingRow.saida ?? null,
          saida_almoco: editingRow.saida_almoco ?? null,
          volta_almoco: editingRow.volta_almoco ?? null,
          intervalo: editingRow.intervalo ?? null,
          observacoes: editingRow.observacoes ?? null,
          tipo_dia: tipo,
        },
      });
      await qc.invalidateQueries({
        queryKey: getGetRegistrosFuncionarioQueryKey(numId, { mes }),
      });
      setEditingRow(null);
    } finally {
      setSaving(false);
    }
  }

  function handleDownloadFolha() {
    downloadAuthenticatedFile(`/api/exportar/folha/${numId}?mes=${mes}`).catch((e) => {
      alert(e instanceof Error ? e.message : String(e));
    });
  }

  async function handleImport() {
    if (!fileRef.current?.files?.[0]) return;
    setImporting(true);
    try {
      const buf = await fileRef.current.files[0].arrayBuffer();
      const resp = await fetch(
        `${baseUrl()}/api/importar?funcionario_id=${numId}&mes=${mes}`,
        {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/octet-stream" }),
          body: buf,
        },
      );
      const json = await resp.json();
      setImportResult(json);
      await qc.invalidateQueries({
        queryKey: getGetRegistrosFuncionarioQueryKey(numId, { mes }),
      });
    } catch (e: unknown) {
      setImportResult({ importados: 0, erros: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setImporting(false);
    }
  }

  const summaryCards = folha
    ? [
        { label: "Total Horas", value: folha.resumo.total_horas, color: "text-[#1B2A4A]" },
        { label: "HE 60%", value: folha.resumo.he_60, color: "text-amber-600" },
        { label: "HE 100%", value: folha.resumo.he_100, color: "text-orange-600" },
        { label: "Atrasos", value: folha.resumo.atrasos, color: "text-yellow-600" },
        { label: "Faltas (dias)", value: folha.resumo.faltas_dia.toString(), color: "text-red-600" },
        { label: "Hrs Just.", value: folha.resumo.horas_justificadas ?? "00:00", color: "text-blue-600" },
        { label: "Dias Just.", value: (folha.resumo.dias_justificados ?? 0).toString(), color: "text-blue-500" },
        { label: "Dias Trab.", value: folha.resumo.dias_trabalhados.toString(), color: "text-green-700" },
        { label: "Dom/Fer.", value: folha.resumo.dom_feriados.toString(), color: "text-gray-500" },
      ]
    : [];

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="text-[#4A90D9] text-sm hover:underline"
            >
              ← Voltar
            </button>
            <div>
              <h1 className="text-lg font-bold text-[#1B2A4A]">
                {folha?.funcionario?.nome ?? "Carregando..."}
              </h1>
              <p className="text-sm text-gray-500">
                {folha?.funcionario?.cargo || "Funcionário"} — {formatMes(mes)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="border rounded px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={handleDownloadFolha}
              className="px-3 py-1.5 text-sm bg-[#1B2A4A] text-white rounded hover:bg-[#253857] transition-colors"
            >
              Exportar Excel
            </button>
            <button
              onClick={() => { setShowImport(true); setImportResult(null); }}
              className="px-3 py-1.5 text-sm bg-[#4A90D9] text-white rounded hover:bg-[#3A80C9] transition-colors"
            >
              Importar Excel
            </button>
          </div>
        </div>

        {summaryCards.length > 0 && (
          <div className="flex gap-3 mt-3 flex-wrap">
            {summaryCards.map((c) => (
              <div key={c.label} className="bg-[#F4F6F8] rounded px-3 py-2 text-center min-w-[90px]">
                <div className={`text-lg font-bold font-mono ${c.color}`}>{c.value}</div>
                <div className="text-xs text-gray-500">{c.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1B2A4A] text-white">
                <th className="px-3 py-2.5 text-left font-semibold">Data</th>
                <th className="px-3 py-2.5 text-left font-semibold">Dia</th>
                <th className="px-3 py-2.5 text-center font-semibold">Entrada</th>
                <th className="px-3 py-2.5 text-center font-semibold">Saída</th>
                <th className="px-3 py-2.5 text-center font-semibold">Intervalo</th>
                <th className="px-3 py-2.5 text-center font-semibold">Total Hrs</th>
                <th className="px-3 py-2.5 text-center font-semibold">HE 60%</th>
                <th className="px-3 py-2.5 text-center font-semibold">HE 100%</th>
                <th className="px-3 py-2.5 text-center font-semibold">Atrasos</th>
                <th className="px-3 py-2.5 text-center font-semibold">Faltas</th>
                <th className="px-3 py-2.5 text-center font-semibold">Tipo</th>
                <th className="px-3 py-2.5 text-center font-semibold">Hrs Just.</th>
                <th className="px-3 py-2.5 text-left font-semibold">Observações</th>
                <th className="px-3 py-2.5 text-center font-semibold">Ed.</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={14} className="text-center py-12 text-gray-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {folha?.registros?.map((reg: FolhaRegistro) => {
                const dt = new Date(reg.data + "T00:00:00");
                const isSabado = dt.getDay() === 6;
                const isDomingo = dt.getDay() === 0;
                const isFolga = reg.jornada_padrao?.is_folga ?? false;
                const rowBg = isDomingo || isFolga
                  ? "bg-yellow-50"
                  : isSabado
                  ? "bg-orange-50"
                  : "bg-white hover:bg-[#F0F5FF]";

                const fmt = (v: string | null | undefined) =>
                  v ? v : <span className="text-gray-300">—</span>;

                return (
                  <tr
                    key={reg.data}
                    className={`border-b transition-colors ${rowBg}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {isoToBrDate(reg.data)}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {reg.dia_semana?.slice(0, 3)}
                      {isFolga && !isDomingo && <span className="ml-1 text-orange-400 text-xs">F</span>}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-sm">{fmt(reg.entrada)}</td>
                    <td className="px-3 py-2 text-center font-mono text-sm">{fmt(reg.saida)}</td>
                    <td className="px-3 py-2 text-center font-mono text-sm">{fmt(reg.intervalo)}</td>
                    <td className="px-3 py-2 text-center font-mono text-sm font-medium">
                      {reg.total_horas ? reg.total_horas : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-sm">
                      {reg.he_60 ? <span className="text-amber-600">{reg.he_60}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-sm">
                      {reg.he_100 ? <span className="text-orange-600">{reg.he_100}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-sm">
                      {reg.atrasos ? <span className="text-yellow-600">{reg.atrasos}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-sm">
                      {reg.faltas && reg.faltas !== "0" ? (
                        <span className="text-red-600 font-medium">{reg.faltas}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {(() => {
                        const t = (reg.tipo_dia as TipoDia | undefined) ?? "normal";
                        const cls: Record<TipoDia, string> = {
                          normal: "text-gray-300",
                          feriado: "bg-yellow-100 text-yellow-800",
                          feriado_trabalhado: "bg-amber-100 text-amber-800",
                          falta: "bg-red-100 text-red-700",
                          falta_justificada: "bg-green-100 text-green-700",
                          atraso_justificado: "bg-blue-100 text-blue-700",
                        };
                        const short: Record<TipoDia, string> = {
                          normal: "—",
                          feriado: "Feriado",
                          feriado_trabalhado: "Fer. Trab.",
                          falta: "Falta",
                          falta_justificada: "Falta Just.",
                          atraso_justificado: "Atr. Just.",
                        };
                        return t === "normal"
                          ? <span className="text-gray-300">—</span>
                          : <span className={`px-1.5 py-0.5 rounded font-medium ${cls[t]}`}>{short[t]}</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-sm">
                      {reg.horas_justificadas ? <span className="text-blue-600">{reg.horas_justificadas}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-[160px] truncate">
                      {reg.observacoes || ""}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleEdit(reg)}
                        className="text-xs px-2 py-1 bg-[#4A90D9] text-white rounded hover:bg-[#3A80C9]"
                      >
                        Ed.
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingRow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-base font-bold text-[#1B2A4A] mb-1">
              Editar Registro — {isoToBrDate(editingRow.data)} ({editingRow.dia_semana})
            </h2>
            {editingRow.jornada_padrao && !editingRow.jornada_padrao.is_folga && (
              <p className="text-xs text-gray-500 mb-3">
                Jornada padrão: {editingRow.jornada_padrao.entrada_padrao ?? "—"} — {editingRow.jornada_padrao.saida_padrao ?? "—"} (intervalo: {editingRow.jornada_padrao.intervalo_padrao ?? "—"})
              </p>
            )}
            {(editingRow.jornada_padrao?.is_folga || isDomFeriado(editingRow.data)) && (
              <p className="text-xs text-amber-600 mb-3 bg-amber-50 px-2 py-1 rounded">
                {isDomFeriado(editingRow.data) ? "Domingo / Feriado Nacional" : "Dia de Folga"} — horas trabalhadas contam como HE 100%
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { key: "entrada", label: "Entrada" },
                  { key: "saida", label: "Saída" },
                  { key: "saida_almoco", label: "Saída Almoço" },
                  { key: "volta_almoco", label: "Volta Almoço" },
                  { key: "intervalo", label: "Intervalo", readOnly: true },
                  { key: "total_horas", label: "Total Horas", readOnly: true },
                  { key: "he_60", label: "HE 60%" },
                  { key: "he_100", label: "HE 100%" },
                  { key: "atrasos", label: "Atrasos" },
                ] as { key: keyof EditRow; label: string; readOnly?: boolean }[]
              ).map(({ key, label, readOnly }) => (
                <div key={key as string}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {label} (HH:MM){readOnly ? " — auto" : ""}
                  </label>
                  <input
                    type="text"
                    placeholder="HH:MM"
                    value={(editingRow[key] as string | null | undefined) ?? ""}
                    readOnly={readOnly}
                    onChange={(e) => handleEditFieldChange(key, e.target.value)}
                    className={`w-full border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A90D9] ${readOnly ? "bg-gray-50 text-gray-500" : ""}`}
                  />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo do Dia</label>
                <select
                  value={(editingRow.tipo_dia as TipoDia | undefined) ?? "normal"}
                  onChange={(e) => handleTipoDiaChange(e.target.value as TipoDia)}
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                >
                  {(Object.keys(TIPO_DIA_LABEL) as TipoDia[]).map((t) => (
                    <option key={t} value={t}>{TIPO_DIA_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 bg-blue-50 border border-blue-200 rounded px-3 py-2 text-xs text-blue-800">
                {TIPO_DIA_BANNER[(editingRow.tipo_dia as TipoDia | undefined) ?? "normal"]}
                {editingRow.horas_justificadas && editingRow.horas_justificadas !== "00:00" && (
                  <> · Horas justificadas: <span className="font-mono font-bold">{editingRow.horas_justificadas}</span></>
                )}
              </div>
              <div className="col-span-2 flex gap-2">
                <button
                  type="button"
                  onClick={handlePreencherPadrao}
                  disabled={!editingRow.jornada_padrao?.entrada_padrao || !editingRow.jornada_padrao?.saida_padrao || TIPOS_SEM_HORARIO.has((editingRow.tipo_dia as TipoDia | undefined) ?? "normal")}
                  className="px-3 py-1.5 text-xs bg-[#1B2A4A] text-white rounded hover:bg-[#253857] disabled:opacity-40"
                >
                  Preencher horário padrão
                </button>
                <button
                  type="button"
                  onClick={handleLimparHorarios}
                  className="px-3 py-1.5 text-xs border rounded text-gray-600 hover:bg-gray-50"
                >
                  Limpar horários
                </button>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Observações (atestado, viagem, ausência autorizada, etc.)
                </label>
                <input
                  type="text"
                  value={editingRow.observacoes ?? ""}
                  onChange={(e) =>
                    setEditingRow((prev) => prev ? { ...prev, observacoes: e.target.value || null } : null)
                  }
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                  placeholder="Ex: Atestado médico, viagem a serviço..."
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setEditingRow(null)}
                className="px-4 py-2 text-sm border rounded text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-[#4A90D9] text-white rounded hover:bg-[#3A80C9] disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-[#1B2A4A] mb-4">Importar Excel</h2>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Arquivo Excel (.xlsx)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                className="w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-[#1B2A4A] file:text-white"
              />
            </div>
            {importResult && (
              <div className={`mb-4 p-3 rounded text-sm ${importResult.erros.length > 0 ? "bg-yellow-50 border border-yellow-200" : "bg-green-50 border border-green-200"}`}>
                <p className="font-medium">{importResult.importados} registro(s) importado(s)</p>
                {importResult.erros.map((e, i) => (
                  <p key={i} className="text-xs text-yellow-700 mt-1">{e}</p>
                ))}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowImport(false)} className="px-4 py-2 text-sm border rounded text-gray-600 hover:bg-gray-50">Fechar</button>
              <button onClick={handleImport} disabled={importing} className="px-4 py-2 text-sm bg-[#4A90D9] text-white rounded hover:bg-[#3A80C9] disabled:opacity-50">
                {importing ? "Importando..." : "Importar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
