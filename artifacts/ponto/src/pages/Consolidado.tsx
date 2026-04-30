import { useState } from "react";
import {
  useGetConsolidado,
  getGetConsolidadoQueryKey,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { formatMes, getCurrentMes, getMonthOptions } from "@/lib/utils";
import type { Consolidado } from "@workspace/api-client-react";

export default function ConsolidadoPage() {
  const [mes, setMes] = useState(getCurrentMes());
  const [, navigate] = useLocation();
  const monthOptions = getMonthOptions();

  const { data, isLoading } = useGetConsolidado(
    { mes },
    { query: { queryKey: getGetConsolidadoQueryKey({ mes }) } },
  );

  const consolidado = data as Consolidado | undefined;
  const linhas = consolidado?.linhas ?? [];
  const total = consolidado?.total_geral;

  const TimeCell = ({ val }: { val: string }) => (
    <span className={`font-mono text-sm ${val !== "00:00" ? "text-[#1B2A4A] font-medium" : "text-gray-300"}`}>
      {val}
    </span>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-[#1B2A4A]">Consolidado do Mês</h1>
          <p className="text-sm text-gray-500">{formatMes(mes)}</p>
        </div>
        <select
          className="border rounded px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
        >
          {monthOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1B2A4A] text-white">
                <th className="px-4 py-3 text-left font-semibold">Nome</th>
                <th className="px-4 py-3 text-center font-semibold">Total Horas</th>
                <th className="px-4 py-3 text-center font-semibold">HE 60%</th>
                <th className="px-4 py-3 text-center font-semibold">HE 100%</th>
                <th className="px-4 py-3 text-center font-semibold">Atrasos</th>
                <th className="px-4 py-3 text-center font-semibold">Faltas</th>
                <th className="px-4 py-3 text-center font-semibold">Hrs Just.</th>
                <th className="px-4 py-3 text-center font-semibold">Dias Just.</th>
                <th className="px-4 py-3 text-center font-semibold">Dias Trab.</th>
                <th className="px-4 py-3 text-center font-semibold">Dom/Fer.</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && linhas.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    Nenhum dado para {formatMes(mes)}.
                  </td>
                </tr>
              )}
              {linhas.map((l, i) => (
                <tr
                  key={l.funcionario_id}
                  className={`border-b hover:bg-[#F0F5FF] transition-colors ${i % 2 === 0 ? "bg-white" : "bg-[#FAFBFC]"}`}
                >
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => navigate(`/funcionario/${l.funcionario_id}`)}
                      className="font-medium text-[#1B66CC] hover:underline text-left"
                    >
                      {l.nome}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-center"><TimeCell val={l.total_horas} /></td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-mono text-sm ${l.he_60 !== "00:00" ? "text-amber-600 font-medium" : "text-gray-300"}`}>
                      {l.he_60}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-mono text-sm ${l.he_100 !== "00:00" ? "text-orange-600 font-medium" : "text-gray-300"}`}>
                      {l.he_100}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-mono text-sm ${l.atrasos !== "00:00" ? "text-yellow-600 font-medium" : "text-gray-300"}`}>
                      {l.atrasos}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-mono text-sm ${l.faltas > 0 ? "text-red-600 font-medium" : "text-gray-300"}`}>
                      {l.faltas}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-mono text-sm ${l.horas_justificadas && l.horas_justificadas !== "00:00" ? "text-blue-600 font-medium" : "text-gray-300"}`}>
                      {l.horas_justificadas || "00:00"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-mono text-sm ${l.dias_justificados > 0 ? "text-blue-600 font-medium" : "text-gray-300"}`}>
                      {l.dias_justificados ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-sm text-gray-700">{l.dias_trabalhados}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-sm text-gray-500">{l.dom_feriados}</td>
                </tr>
              ))}
              {total && linhas.length > 0 && (
                <tr className="bg-[#1B2A4A] text-white font-bold border-t-2 border-[#4A90D9]">
                  <td className="px-4 py-3 text-sm font-bold">TOTAL GERAL</td>
                  <td className="px-4 py-3 text-center font-mono text-sm">{total.total_horas}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm text-amber-300">{total.he_60}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm text-orange-300">{total.he_100}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm text-yellow-300">{total.atrasos}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm text-red-300">{total.faltas}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm text-blue-300">{total.horas_justificadas || "00:00"}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm text-blue-300">{total.dias_justificados ?? 0}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm">{total.dias_trabalhados}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm">{total.dom_feriados}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
