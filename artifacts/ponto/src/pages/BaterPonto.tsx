import { useState, useEffect } from "react";
import {
  useGetFuncionarios,
  useBaterPonto,
} from "@workspace/api-client-react";
import type { Funcionario, BaterPontoResponse } from "@workspace/api-client-react";

export default function BaterPonto() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<BaterPontoResponse | null>(null);

  const { data } = useGetFuncionarios({ ativo: true });
  const funcionarios = (data as Funcionario[] | undefined) ?? [];
  const bater = useBaterPonto();

  useEffect(() => {
    function tick() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      setTime(`${hh}:${mm}:${ss}`);
      const yyyy = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
      setDate(`${days[now.getDay()]}, ${dd}/${mo}/${yyyy}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  async function handleBater(tipo: "entrada" | "saida") {
    if (!selectedId) return;
    try {
      const result = await bater.mutateAsync({
        data: { funcionario_id: selectedId, tipo },
      });
      setConfirmation(result as BaterPontoResponse);
    } catch {}
  }

  const selectedFunc = funcionarios.find((f) => f.id === selectedId);

  return (
    <div className="h-full flex items-center justify-center bg-[#F4F6F8]">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-lg border overflow-hidden">
          <div className="bg-[#1B2A4A] px-8 py-8 text-center">
            <div className="text-6xl font-bold font-mono text-white tracking-widest mb-2">
              {time || "--:--:--"}
            </div>
            <div className="text-[#A8BDD4] text-sm font-medium">{date}</div>
          </div>

          <div className="px-8 py-8">
            {confirmation ? (
              <div className="text-center">
                <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
                  confirmation.tipo === "entrada" ? "bg-green-100" : "bg-red-100"
                }`}>
                  <span className="text-4xl">
                    {confirmation.tipo === "entrada" ? "✓" : "◻"}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-[#1B2A4A] mb-1">
                  {confirmation.tipo === "entrada" ? "Entrada Registrada" : "Saída Registrada"}
                </h2>
                <p className="text-gray-600 mb-1 font-medium">
                  {funcionarios.find((f) => f.id === confirmation.funcionario_id)?.nome}
                </p>
                <p className="text-3xl font-mono font-bold text-[#4A90D9] mb-1">
                  {confirmation.horario}
                </p>
                <p className="text-sm text-gray-400">{confirmation.data.split("-").reverse().join("/")}</p>

                <button
                  onClick={() => {
                    setConfirmation(null);
                    setSelectedId(null);
                  }}
                  className="mt-6 px-6 py-2.5 bg-[#1B2A4A] text-white rounded-lg hover:bg-[#253857] transition-colors text-sm font-medium"
                >
                  Novo Registro
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-[#1B2A4A] mb-2">
                    Selecione o funcionário
                  </label>
                  <select
                    className="w-full border-2 rounded-lg px-4 py-3 text-base font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#4A90D9] focus:border-[#4A90D9] bg-white"
                    value={selectedId ?? ""}
                    onChange={(e) =>
                      setSelectedId(e.target.value ? parseInt(e.target.value) : null)
                    }
                  >
                    <option value="">— Selecione —</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedFunc && (
                  <div className="bg-[#F4F6F8] rounded-lg px-4 py-3 mb-6">
                    <div className="text-xs text-gray-500 mb-0.5">Funcionário selecionado</div>
                    <div className="font-bold text-[#1B2A4A]">{selectedFunc.nome}</div>
                    <div className="text-sm text-gray-500">{selectedFunc.cargo || "Sem cargo"}</div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleBater("entrada")}
                    disabled={!selectedId || bater.isPending}
                    className="py-4 bg-[#1B7A3E] text-white rounded-xl font-bold text-lg hover:bg-[#15612F] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    Entrada
                  </button>
                  <button
                    onClick={() => handleBater("saida")}
                    disabled={!selectedId || bater.isPending}
                    className="py-4 bg-[#B03030] text-white rounded-xl font-bold text-lg hover:bg-[#8C2424] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    Saída
                  </button>
                </div>

                {bater.isError && (
                  <p className="mt-3 text-sm text-center text-red-600">
                    Erro ao registrar ponto. Tente novamente.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
