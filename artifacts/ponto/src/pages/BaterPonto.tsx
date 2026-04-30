import { useState, useEffect, useMemo } from "react";
import {
  useGetFuncionarios,
  useBaterPonto,
  useGetRegistrosFuncionario,
  getGetRegistrosFuncionarioQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  Funcionario,
  BaterPontoResponse,
  FolhaMensal,
  RegistroPonto,
} from "@workspace/api-client-react";

type TipoBater = "entrada" | "saida_almoco" | "volta_almoco" | "saida";

const TIPO_LABEL: Record<TipoBater, string> = {
  entrada: "Entrada",
  saida_almoco: "Saída Intervalo",
  volta_almoco: "Volta Intervalo",
  saida: "Saída",
};

function getCurrentMes(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function BaterPonto() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<BaterPontoResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data } = useGetFuncionarios({ ativo: true });
  const funcionarios = (data as Funcionario[] | undefined) ?? [];
  const bater = useBaterPonto();
  const qc = useQueryClient();

  const mes = getCurrentMes();
  const todayIso = getTodayIso();

  const { data: folhaData, isFetching: folhaFetching } = useGetRegistrosFuncionario(
    selectedId ?? 0,
    { mes },
    {
      query: {
        enabled: !!selectedId,
        queryKey: getGetRegistrosFuncionarioQueryKey(selectedId ?? 0, { mes }),
      },
    },
  );

  const folha = folhaData as FolhaMensal | undefined;

  const todayRegistro: Partial<RegistroPonto> | null = useMemo(() => {
    if (!folha) return null;
    const reg = folha.registros.find((r) => r.data === todayIso);
    return reg ?? null;
  }, [folha, todayIso]);

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

  async function handleBater(tipo: TipoBater) {
    if (!selectedId) return;
    setErrorMsg(null);
    try {
      const result = await bater.mutateAsync({
        data: { funcionario_id: selectedId, tipo },
      });
      setConfirmation(result as BaterPontoResponse);
      await qc.invalidateQueries({
        queryKey: getGetRegistrosFuncionarioQueryKey(selectedId, { mes }),
      });
    } catch (e: unknown) {
      let msg = "Erro ao registrar ponto. Tente novamente.";
      if (e && typeof e === "object" && "message" in e) {
        const raw = (e as { message?: string }).message;
        if (typeof raw === "string" && raw.length > 0) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string") {
              msg = parsed.error;
            }
          } catch {
            msg = raw;
          }
        }
      }
      setErrorMsg(msg);
    }
  }

  const selectedFunc = funcionarios.find((f) => f.id === selectedId);

  const has = {
    entrada: !!todayRegistro?.entrada,
    saida_almoco: !!todayRegistro?.saida_almoco,
    volta_almoco: !!todayRegistro?.volta_almoco,
    saida: !!todayRegistro?.saida,
  };

  function isEnabled(tipo: TipoBater): boolean {
    if (!selectedId || bater.isPending) return false;
    if (folhaFetching) return false;
    if (has.saida) return false;
    if (tipo === "entrada") return !has.entrada;
    if (tipo === "saida_almoco") return has.entrada && !has.saida_almoco;
    if (tipo === "volta_almoco") return has.entrada && has.saida_almoco && !has.volta_almoco;
    if (tipo === "saida") return has.entrada && has.saida_almoco && has.volta_almoco;
    return false;
  }

  function batidoHorario(tipo: TipoBater): string | null {
    if (!todayRegistro) return null;
    return (todayRegistro[tipo] as string | null | undefined) ?? null;
  }

  const buttons: Array<{
    tipo: TipoBater;
    bgEnabled: string;
    bgHover: string;
    bgDisabled: string;
  }> = [
    {
      tipo: "entrada",
      bgEnabled: "bg-[#1B7A3E]",
      bgHover: "hover:bg-[#15612F]",
      bgDisabled: "bg-[#1B7A3E]/40",
    },
    {
      tipo: "saida_almoco",
      bgEnabled: "bg-[#E08B1A]",
      bgHover: "hover:bg-[#C77514]",
      bgDisabled: "bg-[#E08B1A]/40",
    },
    {
      tipo: "volta_almoco",
      bgEnabled: "bg-[#4A90D9]",
      bgHover: "hover:bg-[#3A80C9]",
      bgDisabled: "bg-[#4A90D9]/40",
    },
    {
      tipo: "saida",
      bgEnabled: "bg-[#B03030]",
      bgHover: "hover:bg-[#8C2424]",
      bgDisabled: "bg-[#B03030]/40",
    },
  ];

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
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 bg-[#1B2A4A]/10">
                  <span className="text-4xl">✓</span>
                </div>
                <h2 className="text-xl font-bold text-[#1B2A4A] mb-1">
                  {TIPO_LABEL[confirmation.tipo as TipoBater] ?? confirmation.tipo} registrada
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
                    onChange={(e) => {
                      setSelectedId(e.target.value ? parseInt(e.target.value) : null);
                      setErrorMsg(null);
                    }}
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
                  {buttons.map((b) => {
                    const enabled = isEnabled(b.tipo);
                    const horario = batidoHorario(b.tipo);
                    return (
                      <div key={b.tipo} className="flex flex-col">
                        <button
                          onClick={() => handleBater(b.tipo)}
                          disabled={!enabled}
                          className={`py-4 text-white rounded-xl font-bold text-base transition-colors shadow-sm ${
                            enabled ? `${b.bgEnabled} ${b.bgHover}` : `${b.bgDisabled} cursor-not-allowed`
                          }`}
                        >
                          {TIPO_LABEL[b.tipo]}
                        </button>
                        {horario && (
                          <div className="mt-1.5 text-center text-xs text-gray-600">
                            <span className="font-mono font-semibold text-[#1B2A4A]">{horario}</span>
                            <span className="text-gray-400"> registrado</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {selectedId && has.saida && (
                  <p className="mt-4 text-sm text-center text-gray-500">
                    Todos os pontos do dia já foram registrados.
                  </p>
                )}

                {errorMsg && (
                  <p className="mt-3 text-sm text-center text-red-600">
                    {errorMsg}
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
