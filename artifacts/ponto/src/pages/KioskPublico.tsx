import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";

type TipoBater = "entrada" | "saida_almoco" | "volta_almoco" | "saida";
const TIPO_LABEL: Record<TipoBater, string> = {
  entrada: "Entrada",
  saida_almoco: "Saída Intervalo",
  volta_almoco: "Volta Intervalo",
  saida: "Saída",
};

interface KioskFuncionario { id: number; nome: string; cargo?: string | null }
interface KioskState { empresa: { nome: string }; funcionarios: KioskFuncionario[]; valid_date: string }
interface TodayRecord { entrada?: string | null; saida_almoco?: string | null; volta_almoco?: string | null; saida?: string | null }
interface BaterResp { funcionario_id: number; tipo: string; horario: string; data: string; registro?: TodayRecord }

function getBaseUrl(): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${getBaseUrl()}${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
  return json;
}

function clockTick() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const days = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
  return { time: `${hh}:${mm}:${ss}`, date: `${days[now.getDay()]}, ${dd}/${mo}/${yyyy}` };
}

function getMsToMidnightBR(): number {
  const now = new Date();
  const brNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const brMidnight = new Date(brNow);
  brMidnight.setHours(24, 0, 0, 0);
  return Math.max(0, brMidnight.getTime() - brNow.getTime());
}

const BUTTONS = [
  { tipo: "entrada" as TipoBater, bgEnabled: "bg-[#1B7A3E]", bgHover: "hover:bg-[#15612F]", bgDisabled: "bg-[#1B7A3E]/40" },
  { tipo: "saida_almoco" as TipoBater, bgEnabled: "bg-[#E08B1A]", bgHover: "hover:bg-[#C77514]", bgDisabled: "bg-[#E08B1A]/40" },
  { tipo: "volta_almoco" as TipoBater, bgEnabled: "bg-[#4A90D9]", bgHover: "hover:bg-[#3A80C9]", bgDisabled: "bg-[#4A90D9]/40" },
  { tipo: "saida" as TipoBater, bgEnabled: "bg-[#B03030]", bgHover: "hover:bg-[#8C2424]", bgDisabled: "bg-[#B03030]/40" },
];

export default function KioskPublico() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const [clock, setClock] = useState(clockTick());
  const [state, setState] = useState<KioskState | null>(null);
  const [expired, setExpired] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [todayRec, setTodayRec] = useState<TodayRecord>({});
  const [confirmation, setConfirmation] = useState<BaterResp | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setClock(clockTick()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleExpired = useCallback(() => {
    setExpired(true);
    setState(null);
  }, []);

  const loadState = useCallback(async () => {
    try {
      const data: KioskState = await apiFetch(`/api/kiosk/${token}`);
      setState(data);
      setExpired(false);
      setLoadError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      if (msg.includes("expirado")) {
        handleExpired();
      } else {
        setLoadError(msg);
      }
    }
  }, [token, handleExpired]);

  useEffect(() => { loadState(); }, [loadState]);

  useEffect(() => {
    if (!state) return;
    const msToMidnight = getMsToMidnightBR();
    const id = setTimeout(() => handleExpired(), msToMidnight + 1500);
    return () => clearTimeout(id);
  }, [state, handleExpired]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      loadState();
    }, 60_000);
    return () => clearInterval(id);
  }, [token, loadState]);

  const loadTodayRecord = useCallback(async (funcId: number) => {
    try {
      const rec = await apiFetch(`/api/kiosk/${token}/hoje?funcionario_id=${funcId}`);
      setTodayRec(rec);
    } catch {
      setTodayRec({});
    }
  }, [token]);

  useEffect(() => {
    if (selectedId) loadTodayRecord(selectedId);
    else setTodayRec({});
  }, [selectedId, loadTodayRecord]);

  async function handleBater(tipo: TipoBater) {
    if (!selectedId || loading) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const result: BaterResp = await apiFetch(`/api/kiosk/${token}/bater`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funcionario_id: selectedId, tipo }),
      });
      setConfirmation(result);
      if (result.registro) {
        setTodayRec(result.registro);
      } else {
        await loadTodayRecord(selectedId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      if (msg.includes("expirado")) { handleExpired(); }
      else setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }

  const has = {
    entrada: !!todayRec.entrada,
    saida_almoco: !!todayRec.saida_almoco,
    volta_almoco: !!todayRec.volta_almoco,
    saida: !!todayRec.saida,
  };

  function isEnabled(tipo: TipoBater) {
    if (!selectedId || loading || has.saida) return false;
    if (tipo === "entrada") return !has.entrada;
    if (tipo === "saida_almoco") return has.entrada && !has.saida_almoco;
    if (tipo === "volta_almoco") return has.entrada && has.saida_almoco && !has.volta_almoco;
    if (tipo === "saida") return has.entrada && has.saida_almoco && has.volta_almoco;
    return false;
  }

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8]">
        <div className="bg-white rounded-2xl shadow-lg border p-12 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-[#1B2A4A] mb-3">Link expirado</h2>
          <p className="text-gray-500 text-sm">Peça o novo link de hoje ao seu gestor.</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8]">
        <div className="bg-white rounded-2xl shadow-lg border p-12 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-[#1B2A4A] mb-3">Não foi possível carregar</h2>
          <p className="text-gray-500 text-sm">{loadError}</p>
          <button onClick={loadState} className="mt-6 px-6 py-2 bg-[#4A90D9] text-white rounded-lg text-sm font-medium">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8]">
        <div className="text-[#5C6E84]">Carregando...</div>
      </div>
    );
  }

  const selectedFunc = state.funcionarios.find((f) => f.id === selectedId);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8]">
      <div className="w-full max-w-lg px-4">
        <div className="text-center mb-3">
          <div className="text-[#5C6E84] text-sm font-medium">{state.empresa.nome}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border overflow-hidden">
          <div className="bg-[#1B2A4A] px-8 py-8 text-center">
            <div className="text-6xl font-bold font-mono text-white tracking-widest mb-2">
              {clock.time || "--:--:--"}
            </div>
            <div className="text-[#A8BDD4] text-sm font-medium">{clock.date}</div>
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
                  {state.funcionarios.find((f) => f.id === confirmation.funcionario_id)?.nome}
                </p>
                <p className="text-3xl font-mono font-bold text-[#4A90D9] mb-1">{confirmation.horario}</p>
                <p className="text-sm text-gray-400">{confirmation.data.split("-").reverse().join("/")}</p>
                <button
                  onClick={() => { setConfirmation(null); setSelectedId(null); setTodayRec({}); }}
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
                    onChange={(e) => { setSelectedId(e.target.value ? parseInt(e.target.value) : null); setErrorMsg(null); }}
                  >
                    <option value="">— Selecione —</option>
                    {state.funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
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
                  {BUTTONS.map((b) => {
                    const enabled = isEnabled(b.tipo);
                    const horario = (todayRec[b.tipo] as string | null | undefined) ?? null;
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
                  <p className="mt-3 text-sm text-center text-red-600">{errorMsg}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
