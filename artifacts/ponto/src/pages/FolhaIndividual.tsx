import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetRegistrosFuncionario,
  useUpsertRegistro,
  getGetRegistrosFuncionarioQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatMes, getCurrentMes, getMonthOptions, baseUrl } from "@/lib/utils";
import type { FolhaMensal, RegistroPonto } from "@workspace/api-client-react";

interface EditRow extends Partial<RegistroPonto> {
  data: string;
  dia_semana?: string;
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

  const folha = data as FolhaMensal | undefined;
  const upsert = useUpsertRegistro();

  const [editingRow, setEditingRow] = useState<EditRow | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ importados: number; erros: string[] } | null>(null);
  const [showImport, setShowImport] = useState(false);

  function handleEdit(reg: any) {
    setEditingRow({ ...reg });
  }

  async function handleSave() {
    if (!editingRow || !numId) return;
    setSaving(true);
    try {
      await upsert.mutateAsync({
        data: {
          funcionario_id: numId,
          data: editingRow.data,
          entrada: editingRow.entrada ?? null,
          saida: editingRow.saida ?? null,
          intervalo: editingRow.intervalo ?? null,
          he_60: editingRow.he_60 ?? null,
          he_100: editingRow.he_100 ?? null,
          atrasos: editingRow.atrasos ?? null,
          faltas: editingRow.faltas ?? null,
          observacoes: editingRow.observacoes ?? null,
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
    window.open(`${baseUrl()}/api/exportar/folha/${numId}?mes=${mes}`, "_blank");
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
          headers: { "Content-Type": "application/octet-stream" },
          body: buf,
        },
      );
      const json = await resp.json();
      setImportResult(json);
      await qc.invalidateQueries({
        queryKey: getGetRegistrosFuncionarioQueryKey(numId, { mes }),
      });
    } catch (e: any) {
      setImportResult({ importados: 0, erros: [e.message] });
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
                <th className="px-3 py-2.5 text-left font-semibold">Observações</th>
                <th className="px-3 py-2.5 text-center font-semibold">Ed.</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-gray-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {folha?.registros?.map((reg: any) => {
                const dt = new Date(reg.data + "T00:00:00");
                const isSabado = dt.getDay() === 6;
                const isDomingo = dt.getDay() === 0;
                const rowBg = isDomingo
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
                      {reg.data.slice(5)}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {reg.dia_semana?.slice(0, 3)}
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
            <h2 className="text-base font-bold text-[#1B2A4A] mb-4">
              Editar Registro — {editingRow.data} ({(editingRow as any).dia_semana})
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "entrada", label: "Entrada" },
                { key: "saida", label: "Saída" },
                { key: "intervalo", label: "Intervalo" },
                { key: "he_60", label: "HE 60%" },
                { key: "he_100", label: "HE 100%" },
                { key: "atrasos", label: "Atrasos" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label} (HH:MM)</label>
                  <input
                    type="text"
                    placeholder="HH:MM"
                    value={(editingRow as any)[key] ?? ""}
                    onChange={(e) =>
                      setEditingRow((prev) => prev ? { ...prev, [key]: e.target.value || null } : null)
                    }
                    className="w-full border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Faltas</label>
                <select
                  value={(editingRow as any).faltas ?? "0"}
                  onChange={(e) =>
                    setEditingRow((prev) => prev ? { ...prev, faltas: e.target.value } : null)
                  }
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                >
                  <option value="0">Sem falta</option>
                  <option value="1">1 dia</option>
                  <option value="0.5">Meio dia</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Observações</label>
                <input
                  type="text"
                  value={(editingRow as any).observacoes ?? ""}
                  onChange={(e) =>
                    setEditingRow((prev) => prev ? { ...prev, observacoes: e.target.value || null } : null)
                  }
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
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
