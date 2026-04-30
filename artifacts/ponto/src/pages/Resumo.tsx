import { useState, useRef } from "react";
import {
  useGetResumo,
  useGetFuncionarios,
  getGetResumoQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatMes, getCurrentMes, getMonthOptions, baseUrl, authHeaders, downloadAuthenticatedFile } from "@/lib/utils";
import type { ResumoFuncionario } from "@workspace/api-client-react";

const VINCULOS = ["CLT", "Contribuinte", "Autonomo", "Estagiario"];
const SITUACOES = ["Ativo", "Demitido", "Aviso", "Ferias"];
const VINCULO_LABEL: Record<string, string> = {
  CLT: "CLT",
  Contribuinte: "Contribuinte",
  Autonomo: "Autônomo",
  Estagiario: "Estagiário",
};
const SITUACAO_LABEL: Record<string, string> = {
  Ativo: "Ativo",
  Demitido: "Demitido",
  Aviso: "Aviso",
  Ferias: "Férias",
};

export default function Resumo() {
  const [mes, setMes] = useState(getCurrentMes());
  const [situacao, setSituacao] = useState("");
  const [vinculo, setVinculo] = useState("");
  const [importModal, setImportModal] = useState<{ open: boolean; funcionarioId?: number; nome?: string }>({ open: false });
  const [importMes, setImportMes] = useState(getCurrentMes());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ importados: number; erros: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  const monthOptions = getMonthOptions();

  const params: { mes: string; situacao?: string; vinculo?: string } = { mes };
  if (situacao) params.situacao = situacao;
  if (vinculo) params.vinculo = vinculo;

  const { data: resumo, isLoading } = useGetResumo(params, {
    query: { queryKey: getGetResumoQueryKey(params) },
  });

  const rows = resumo as ResumoFuncionario[] | undefined;

  function handleDownloadModelo() {
    downloadAuthenticatedFile("/api/exportar/modelo", "modelo_controle_ponto.xlsx").catch((e) => {
      alert(e instanceof Error ? e.message : String(e));
    });
  }

  function openImportModal(funcionarioId: number, nome: string) {
    setImportModal({ open: true, funcionarioId, nome });
    setImportMes(mes);
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleImport() {
    if (!fileRef.current?.files?.[0] || !importModal.funcionarioId) return;
    setImporting(true);
    try {
      const file = fileRef.current.files[0];
      const buf = await file.arrayBuffer();
      const resp = await fetch(
        `${baseUrl()}/api/importar?funcionario_id=${importModal.funcionarioId}&mes=${importMes}`,
        {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/octet-stream" }),
          body: buf,
        },
      );
      const json = await resp.json();
      setImportResult(json);
    } catch (e: unknown) {
      setImportResult({ importados: 0, erros: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-[#1B2A4A]">Resumo Geral</h1>
          <p className="text-sm text-gray-500">{formatMes(mes)}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="border rounded px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            className="border rounded px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
            value={situacao}
            onChange={(e) => setSituacao(e.target.value)}
          >
            <option value="">Situação</option>
            {SITUACOES.map((s) => (
              <option key={s} value={s}>{SITUACAO_LABEL[s]}</option>
            ))}
          </select>
          <select
            className="border rounded px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
            value={vinculo}
            onChange={(e) => setVinculo(e.target.value)}
          >
            <option value="">Vínculo</option>
            {VINCULOS.map((v) => (
              <option key={v} value={v}>{VINCULO_LABEL[v]}</option>
            ))}
          </select>
          <button
            onClick={handleDownloadModelo}
            className="px-3 py-1.5 text-sm bg-[#1B2A4A] text-white rounded hover:bg-[#253857] transition-colors"
          >
            Baixar Modelo Excel
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1B2A4A] text-white">
                <th className="px-3 py-2.5 text-left font-semibold">Cód.</th>
                <th className="px-3 py-2.5 text-left font-semibold">Nome</th>
                <th className="px-3 py-2.5 text-left font-semibold">Vínculo</th>
                <th className="px-3 py-2.5 text-left font-semibold">Cargo</th>
                <th className="px-3 py-2.5 text-left font-semibold">Situação</th>
                <th className="px-3 py-2.5 text-center font-semibold">Adianto.</th>
                <th className="px-3 py-2.5 text-center font-semibold">Transp.</th>
                <th className="px-3 py-2.5 text-center font-semibold">Faltas Dia</th>
                <th className="px-3 py-2.5 text-center font-semibold">Faltas Hrs</th>
                <th className="px-3 py-2.5 text-center font-semibold">Hrs Just.</th>
                <th className="px-3 py-2.5 text-center font-semibold">Dias Just.</th>
                <th className="px-3 py-2.5 text-center font-semibold">HE 60%</th>
                <th className="px-3 py-2.5 text-center font-semibold">HE 100%</th>
                <th className="px-3 py-2.5 text-center font-semibold">Ações</th>
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
              {!isLoading && (!rows || rows.length === 0) && (
                <tr>
                  <td colSpan={14} className="text-center py-12 text-gray-400">
                    Nenhum funcionário encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
              {rows?.map((r, i) => (
                <tr
                  key={r.id}
                  className={`border-b last:border-b-0 hover:bg-[#F0F5FF] transition-colors ${i % 2 === 0 ? "bg-white" : "bg-[#FAFBFC]"}`}
                >
                  <td className="px-3 py-2 font-mono text-gray-500">{r.codigo}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => navigate(`/funcionario/${r.id}`)}
                      className="font-medium text-[#1B66CC] hover:underline text-left"
                    >
                      {r.nome}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{VINCULO_LABEL[r.vinculo] ?? r.vinculo}</td>
                  <td className="px-3 py-2 text-gray-600">{r.cargo || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      r.situacao === "Ativo"
                        ? "bg-green-100 text-green-700"
                        : r.situacao === "Demitido"
                        ? "bg-red-100 text-red-700"
                        : r.situacao === "Ferias"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {SITUACAO_LABEL[r.situacao] ?? r.situacao}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.adiantamento ? (
                      <span className="text-green-600 font-bold">S</span>
                    ) : (
                      <span className="text-gray-300">N</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.transporte ? (
                      <span className="text-green-600 font-bold">S</span>
                    ) : (
                      <span className="text-gray-300">N</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-mono">
                    {r.faltas_dia > 0 ? (
                      <span className="text-red-600 font-medium">{r.faltas_dia}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-mono">
                    {r.faltas_horas !== "00:00" ? (
                      <span className="text-red-600">{r.faltas_horas}</span>
                    ) : (
                      <span className="text-gray-400">00:00</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-mono">
                    {r.horas_justificadas && r.horas_justificadas !== "00:00" ? (
                      <span className="text-blue-600">{r.horas_justificadas}</span>
                    ) : (
                      <span className="text-gray-400">00:00</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-mono">
                    {r.dias_justificados && r.dias_justificados > 0 ? (
                      <span className="text-blue-600">{r.dias_justificados}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-mono">
                    {r.he_60 !== "00:00" ? (
                      <span className="text-amber-600 font-medium">{r.he_60}</span>
                    ) : (
                      <span className="text-gray-400">00:00</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-mono">
                    {r.he_100 !== "00:00" ? (
                      <span className="text-orange-600 font-medium">{r.he_100}</span>
                    ) : (
                      <span className="text-gray-400">00:00</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => openImportModal(r.id, r.nome)}
                      className="text-xs px-2 py-1 bg-[#4A90D9] text-white rounded hover:bg-[#3A80C9] transition-colors"
                    >
                      Importar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {importModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-[#1B2A4A] mb-1">Importar Excel</h2>
            <p className="text-sm text-gray-500 mb-4">{importModal.nome}</p>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Mês de referência</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                value={importMes}
                onChange={(e) => setImportMes(e.target.value)}
              >
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Arquivo Excel (.xlsx)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                className="w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-[#1B2A4A] file:text-white hover:file:bg-[#253857]"
              />
            </div>

            {importResult && (
              <div className={`mb-4 p-3 rounded text-sm ${importResult.erros.length > 0 ? "bg-yellow-50 border border-yellow-200" : "bg-green-50 border border-green-200"}`}>
                <p className="font-medium">{importResult.importados} registro(s) importado(s)</p>
                {importResult.erros.length > 0 && (
                  <ul className="mt-1 text-xs text-yellow-700 list-disc list-inside">
                    {importResult.erros.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setImportModal({ open: false })}
                className="px-4 py-2 text-sm border rounded text-gray-600 hover:bg-gray-50"
              >
                Fechar
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 text-sm bg-[#4A90D9] text-white rounded hover:bg-[#3A80C9] disabled:opacity-50"
              >
                {importing ? "Importando..." : "Importar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
