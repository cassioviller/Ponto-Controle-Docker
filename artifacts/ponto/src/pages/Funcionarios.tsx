import { useState, useRef, useMemo, useEffect } from "react";
import {
  useGetFuncionarios,
  useCreateFuncionario,
  useUpdateFuncionario,
  useDeleteFuncionario,
  getGetFuncionariosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  Funcionario,
  CreateFuncionarioBody,
  UpdateFuncionarioBody,
  CreateFuncionarioBodyVinculo,
  CreateFuncionarioBodySituacao,
  FuncionarioArquivo,
} from "@workspace/api-client-react";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { baseUrl, authHeaders, formatBRL } from "@/lib/utils";
import { maskHHMM } from "@/lib/hhmm";

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

const ESTADOS_CIVIS = [
  "Solteiro",
  "Casado",
  "Divorciado",
  "Viúvo",
  "União estável",
];

const RACAS_COR = ["Branca", "Preta", "Parda", "Amarela", "Indígena", "Não declarada"];

const ESCOLARIDADES = [
  "Fundamental incompleto",
  "Fundamental completo",
  "Médio incompleto",
  "Médio completo",
  "Superior incompleto",
  "Superior completo",
  "Pós-graduação",
];

const DIAS_SEMANA = [
  { num: 1, label: "Segunda" },
  { num: 2, label: "Terça" },
  { num: 3, label: "Quarta" },
  { num: 4, label: "Quinta" },
  { num: 5, label: "Sexta" },
  { num: 6, label: "Sábado" },
  { num: 0, label: "Domingo" },
];

interface JornadaDia {
  dia_semana: number;
  entrada_padrao: string;
  saida_padrao: string;
  intervalo_padrao: string;
  is_folga: boolean;
}

function defaultJornada(jornada_diaria: string): JornadaDia[] {
  return DIAS_SEMANA.map(({ num }) => ({
    dia_semana: num,
    entrada_padrao: num === 0 || num === 6 ? "" : "08:00",
    saida_padrao: num === 0 || num === 6 ? "" : jornada_diaria === "06:00" ? "14:00" : "17:00",
    intervalo_padrao: num === 0 || num === 6 ? "" : jornada_diaria === "06:00" ? "00:00" : "01:00",
    is_folga: num === 0 || num === 6,
  }));
}

/**
 * Default Semana B para escala quinzenal: começa "espelhando" Semana A —
 * o usuário ajusta o que diferencia (tipicamente o sábado vira folga ou vice-versa).
 */
function defaultJornadaSemanaB(jornadaA: JornadaDia[]): JornadaDia[] {
  return jornadaA.map((j) => ({ ...j }));
}

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function hhmmToMinutes(hhmm: string): number | null {
  if (!HHMM_RE.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Calcula a jornada diária mais frequente entre os dias não-folga
 * com entrada+saída válidas. Duração = (saída − entrada) − intervalo.
 * Empate ⇒ menor valor. Sem dias válidos ⇒ null.
 */
export function computeJornadaDiariaFromPadrao(jornadas: JornadaDia[]): string | null {
  const counts = new Map<number, number>();
  for (const j of jornadas) {
    if (j.is_folga) continue;
    const entrada = hhmmToMinutes(j.entrada_padrao);
    const saida = hhmmToMinutes(j.saida_padrao);
    if (entrada == null || saida == null) continue;
    const intervalo = j.intervalo_padrao
      ? hhmmToMinutes(j.intervalo_padrao) ?? 0
      : 0;
    const diff = saida - entrada - intervalo;
    if (diff <= 0) continue;
    counts.set(diff, (counts.get(diff) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let bestMin = Infinity;
  let bestCount = -1;
  for (const [min, count] of counts) {
    if (count > bestCount || (count === bestCount && min < bestMin)) {
      bestCount = count;
      bestMin = min;
    }
  }
  return minutesToHHMM(bestMin);
}

type FormState = Partial<CreateFuncionarioBody & { id?: number }> & {
  empresa?: string | null;
  data_contrato?: string | null;
  salario?: string | null;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  cep?: string | null;
  estado_civil?: string | null;
  raca_cor?: string | null;
  horario?: string | null;
  escolaridade?: string | null;
  pis?: string | null;
  escala_quinzenal?: boolean;
  quinzena_referencia?: string | null;
};

const EMPTY_FORM: FormState = {
  codigo: undefined,
  nome: "",
  cargo: "",
  vinculo: "CLT" as CreateFuncionarioBodyVinculo,
  situacao: "Ativo" as CreateFuncionarioBodySituacao,
  adiantamento: 0,
  transporte: false,
  jornada_diaria: "08:00",
  ativo: true,
  empresa: "",
  data_contrato: "",
  salario: "",
  endereco: "",
  numero: "",
  bairro: "",
  cidade: "",
  cep: "",
  estado_civil: "",
  raca_cor: "",
  horario: "",
  escolaridade: "",
  pis: "",
  escala_quinzenal: false,
  quinzena_referencia: "",
};

function fileTypeIcon(mime: string): string {
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📄";
  if (mime.includes("word") || mime.includes("officedocument")) return "📝";
  return "📎";
}

export default function Funcionarios() {
  const { data, isLoading } = useGetFuncionarios();
  const funcionarios = (data as Funcionario[] | undefined) ?? [];
  const qc = useQueryClient();
  const create = useCreateFuncionario();
  const update = useUpdateFuncionario();
  const del = useDeleteFuncionario();
  const { empresa } = useEmpresa();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [jornadas, setJornadas] = useState<JornadaDia[]>(defaultJornada("08:00"));
  const [jornadasB, setJornadasB] = useState<JornadaDia[]>(defaultJornada("08:00"));
  const [loadingJornadas, setLoadingJornadas] = useState(false);
  const [arquivos, setArquivos] = useState<FuncionarioArquivo[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadJornadas(funcionarioId: number, jornadaDiaria: string) {
    setLoadingJornadas(true);
    try {
      const base = baseUrl();
      const resp = await fetch(`${base}/api/funcionarios/${funcionarioId}/jornadas`, {
        headers: authHeaders(),
      });
      if (resp.ok) {
        const data = await resp.json() as Array<{
          dia_semana: number;
          semana?: number | null;
          entrada_padrao: string | null;
          saida_padrao: string | null;
          intervalo_padrao: string | null;
          is_folga: boolean;
        }>;
        const mapForSemana = (semana: 1 | 2) => {
          const map = new Map(
            data
              .filter((j) => (j.semana ?? 1) === semana)
              .map((j) => [j.dia_semana, j]),
          );
          return DIAS_SEMANA.map(({ num }) => {
            const j = map.get(num);
            if (j) {
              return {
                dia_semana: num,
                entrada_padrao: j.entrada_padrao ?? "",
                saida_padrao: j.saida_padrao ?? "",
                intervalo_padrao: j.intervalo_padrao ?? "",
                is_folga: j.is_folga,
              };
            }
            return defaultJornada(jornadaDiaria).find((d) => d.dia_semana === num)!;
          });
        };
        const semA = mapForSemana(1);
        const hasSemB = data.some((j) => (j.semana ?? 1) === 2);
        setJornadas(semA);
        setJornadasB(hasSemB ? mapForSemana(2) : defaultJornadaSemanaB(semA));
      } else {
        const fallback = defaultJornada(jornadaDiaria);
        setJornadas(fallback);
        setJornadasB(defaultJornadaSemanaB(fallback));
      }
    } catch {
      const fallback = defaultJornada(jornadaDiaria);
      setJornadas(fallback);
      setJornadasB(defaultJornadaSemanaB(fallback));
    } finally {
      setLoadingJornadas(false);
    }
  }

  async function loadArquivos(funcionarioId: number) {
    try {
      const base = baseUrl();
      const resp = await fetch(`${base}/api/funcionarios/${funcionarioId}/arquivos`, {
        headers: authHeaders(),
      });
      if (resp.ok) {
        const list = (await resp.json()) as FuncionarioArquivo[];
        setArquivos(list);
      } else {
        setArquivos([]);
      }
    } catch {
      setArquivos([]);
    }
  }

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    const initial = defaultJornada("08:00");
    setJornadas(initial);
    setJornadasB(defaultJornadaSemanaB(initial));
    setArquivos([]);
    setUploadError(null);
    setDrawerOpen(true);
  }

  function openEdit(f: Funcionario) {
    setForm({
      codigo: f.codigo,
      nome: f.nome,
      cargo: f.cargo,
      vinculo: f.vinculo as CreateFuncionarioBodyVinculo,
      situacao: f.situacao as CreateFuncionarioBodySituacao,
      adiantamento: f.adiantamento ?? 0,
      transporte: f.transporte,
      jornada_diaria: f.jornada_diaria,
      ativo: f.ativo,
      empresa: f.empresa ?? "",
      data_contrato: f.data_contrato ?? "",
      salario: f.salario ?? "",
      endereco: f.endereco ?? "",
      numero: f.numero ?? "",
      bairro: f.bairro ?? "",
      cidade: f.cidade ?? "",
      cep: f.cep ?? "",
      estado_civil: f.estado_civil ?? "",
      raca_cor: f.raca_cor ?? "",
      horario: f.horario ?? "",
      escolaridade: f.escolaridade ?? "",
      pis: f.pis ?? "",
      escala_quinzenal: (f as Funcionario & { escala_quinzenal?: boolean }).escala_quinzenal ?? false,
      quinzena_referencia:
        (f as Funcionario & { quinzena_referencia?: string | null }).quinzena_referencia ?? "",
    });
    setEditId(f.id);
    setUploadError(null);
    setDrawerOpen(true);
    loadJornadas(f.id, f.jornada_diaria);
    loadArquivos(f.id);
  }

  function updateJornada(diaSemana: number, field: keyof JornadaDia, value: string | boolean) {
    setJornadas((prev) =>
      prev.map((j) => (j.dia_semana === diaSemana ? { ...j, [field]: value } : j))
    );
  }

  function updateJornadaB(diaSemana: number, field: keyof JornadaDia, value: string | boolean) {
    setJornadasB((prev) =>
      prev.map((j) => (j.dia_semana === diaSemana ? { ...j, [field]: value } : j))
    );
  }

  const jornadaDiariaCalculada = useMemo(
    () =>
      computeJornadaDiariaFromPadrao(
        form.escala_quinzenal ? [...jornadas, ...jornadasB] : jornadas,
      ),
    [jornadas, jornadasB, form.escala_quinzenal],
  );

  useEffect(() => {
    if (jornadaDiariaCalculada == null) return;
    setForm((p) =>
      p.jornada_diaria === jornadaDiariaCalculada
        ? p
        : { ...p, jornada_diaria: jornadaDiariaCalculada },
    );
  }, [jornadaDiariaCalculada]);

  async function saveJornadas(funcionarioId: number) {
    const base = baseUrl();
    const semanaA = jornadas.map((j) => ({
      dia_semana: j.dia_semana,
      semana: 1,
      empresa_id: empresa?.id ?? 1,
      entrada_padrao: j.entrada_padrao || null,
      saida_padrao: j.saida_padrao || null,
      intervalo_padrao: j.intervalo_padrao || null,
      is_folga: j.is_folga,
    }));
    const semanaB = form.escala_quinzenal
      ? jornadasB.map((j) => ({
          dia_semana: j.dia_semana,
          semana: 2,
          empresa_id: empresa?.id ?? 1,
          entrada_padrao: j.entrada_padrao || null,
          saida_padrao: j.saida_padrao || null,
          intervalo_padrao: j.intervalo_padrao || null,
          is_folga: j.is_folga,
        }))
      : [];
    await fetch(`${base}/api/funcionarios/${funcionarioId}/jornadas`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify([...semanaA, ...semanaB]),
    });
  }

  function buildBody(): CreateFuncionarioBody {
    const { id: _ignored, ...rest } = form as CreateFuncionarioBody & { id?: number };
    // Convert empty strings to null for optional fields so the DB stores NULL.
    const body: CreateFuncionarioBody = { ...rest } as CreateFuncionarioBody;
    const opt = [
      "empresa",
      "data_contrato",
      "salario",
      "endereco",
      "numero",
      "bairro",
      "cidade",
      "cep",
      "estado_civil",
      "raca_cor",
      "horario",
      "escolaridade",
      "pis",
      "quinzena_referencia",
    ] as const;
    const bodyAny = body as unknown as Record<string, unknown>;
    for (const k of opt) {
      if (bodyAny[k] === "") bodyAny[k] = null;
    }
    return body;
  }

  async function handleSave() {
    if (form.escala_quinzenal && !form.quinzena_referencia) {
      alert(
        "Escala quinzenal habilitada — selecione a 'Data de referência (Semana A)' antes de salvar.",
      );
      return;
    }
    setSaving(true);
    try {
      const formData = buildBody();
      let funcionarioId: number;
      if (editId) {
        await update.mutateAsync({ id: editId, data: formData as UpdateFuncionarioBody });
        funcionarioId = editId;
      } else {
        const created = await create.mutateAsync({ data: formData });
        funcionarioId = (created as Funcionario).id;
      }
      await saveJornadas(funcionarioId);
      await qc.invalidateQueries({ queryKey: getGetFuncionariosQueryKey() });
      setDrawerOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await del.mutateAsync({ id });
    await qc.invalidateQueries({ queryKey: getGetFuncionariosQueryKey() });
    setDeleteConfirm(null);
  }

  async function handleUploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!editId) {
      setUploadError("Salve o funcionário antes de anexar arquivos.");
      return;
    }
    setUploadError(null);
    setUploadingFile(true);
    try {
      const base = baseUrl();
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const fd = new FormData();
        fd.append("file", file);
        const resp = await fetch(`${base}/api/funcionarios/${editId}/arquivos`, {
          method: "POST",
          headers: authHeaders(),
          body: fd,
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({} as { error?: string }));
          throw new Error(data.error ?? `Falha ao enviar ${file.name}`);
        }
      }
      await loadArquivos(editId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro ao enviar arquivo");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveArquivo(arquivoId: number) {
    if (!editId) return;
    const base = baseUrl();
    const resp = await fetch(
      `${base}/api/funcionarios/${editId}/arquivos/${arquivoId}`,
      { method: "DELETE", headers: authHeaders() },
    );
    if (resp.ok) {
      await loadArquivos(editId);
    }
  }

  async function handleDownloadArquivo(arquivo: FuncionarioArquivo) {
    if (!editId) return;
    const base = baseUrl();
    const resp = await fetch(
      `${base}/api/funcionarios/${editId}/arquivos/${arquivo.id}/download`,
      { headers: authHeaders() },
    );
    if (!resp.ok) return;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = arquivo.nome_arquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const setField = (k: string, v: string | boolean | number | null | undefined) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-[#1B2A4A]">Gestão de Funcionários</h1>
          <p className="text-sm text-gray-500">{funcionarios.length} funcionário(s) cadastrado(s)</p>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded hover:bg-[#253857] transition-colors font-medium"
        >
          + Novo Funcionário
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1B2A4A] text-white">
                <th className="px-3 py-2.5 text-left font-semibold">Cód.</th>
                <th className="px-3 py-2.5 text-left font-semibold">Nome</th>
                <th className="px-3 py-2.5 text-left font-semibold">Cargo</th>
                <th className="px-3 py-2.5 text-left font-semibold">Vínculo</th>
                <th className="px-3 py-2.5 text-left font-semibold">Situação</th>
                <th className="px-3 py-2.5 text-right font-semibold">Adianto. (R$)</th>
                <th className="px-3 py-2.5 text-center font-semibold">Transp.</th>
                <th className="px-3 py-2.5 text-center font-semibold">Jornada</th>
                <th className="px-3 py-2.5 text-center font-semibold">Ativo</th>
                <th className="px-3 py-2.5 text-center font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">Carregando...</td>
                </tr>
              )}
              {!isLoading && funcionarios.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    Nenhum funcionário cadastrado. Clique em "Novo Funcionário" para adicionar.
                  </td>
                </tr>
              )}
              {funcionarios.map((f, i) => (
                <tr key={f.id} className={`border-b last:border-b-0 hover:bg-[#F0F5FF] transition-colors ${i % 2 === 0 ? "bg-white" : "bg-[#FAFBFC]"}`}>
                  <td className="px-3 py-2 font-mono text-gray-500">{f.codigo}</td>
                  <td className="px-3 py-2 font-medium text-[#1B2A4A]">{f.nome}</td>
                  <td className="px-3 py-2 text-gray-600">{f.cargo || "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{VINCULO_LABEL[f.vinculo] ?? f.vinculo}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      f.situacao === "Ativo" ? "bg-green-100 text-green-700" :
                      f.situacao === "Demitido" ? "bg-red-100 text-red-700" :
                      f.situacao === "Ferias" ? "bg-blue-100 text-blue-700" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>
                      {SITUACAO_LABEL[f.situacao] ?? f.situacao}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {(f.adiantamento ?? 0) > 0 ? (
                      <span className="text-green-700 font-medium">{formatBRL(f.adiantamento)}</span>
                    ) : (
                      <span className="text-gray-300">{formatBRL(0)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {f.transporte ? <span className="text-green-600 font-bold">S</span> : <span className="text-gray-300">N</span>}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs">{f.jornada_diaria}</td>
                  <td className="px-3 py-2 text-center">
                    {f.ativo ? <span className="text-green-600 font-bold">S</span> : <span className="text-gray-300">N</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEdit(f)}
                        className="text-xs px-2 py-1 bg-[#4A90D9] text-white rounded hover:bg-[#3A80C9] transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(f.id)}
                        className="text-xs px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                      >
                        Desativar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-50">
          <div className="bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl">
            <div className="bg-[#1B2A4A] px-6 py-4 text-white">
              <h2 className="text-base font-bold">
                {editId ? "Editar Funcionário" : "Novo Funcionário"}
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* ----- Dados do Contrato ----- */}
              <section>
                <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3 border-b pb-1">
                  Dados do Contrato
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Código *</label>
                    <input
                      type="number"
                      value={form.codigo ?? ""}
                      onChange={(e) => setField("codigo", parseInt(e.target.value) || undefined)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
                    <input
                      type="text"
                      value={form.empresa ?? ""}
                      onChange={(e) => setField("empresa", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                      placeholder="Nome da empresa contratante"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Vínculo</label>
                    <select
                      value={form.vinculo ?? "CLT"}
                      onChange={(e) => setField("vinculo", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                    >
                      {VINCULOS.map((v) => (
                        <option key={v} value={v}>{VINCULO_LABEL[v]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Função / Cargo</label>
                    <input
                      type="text"
                      value={form.cargo ?? ""}
                      onChange={(e) => setField("cargo", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                      placeholder="Ex: Vendedor"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Data do Contrato</label>
                    <input
                      type="date"
                      value={form.data_contrato ?? ""}
                      onChange={(e) => setField("data_contrato", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Salário (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.salario ?? ""}
                      onChange={(e) => setField("salario", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Situação</label>
                    <select
                      value={form.situacao ?? "Ativo"}
                      onChange={(e) => setField("situacao", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                    >
                      {SITUACOES.map((s) => (
                        <option key={s} value={s}>{SITUACAO_LABEL[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Jornada Diária</label>
                    <input
                      type="text"
                      readOnly
                      tabIndex={-1}
                      value={jornadaDiariaCalculada ?? "—"}
                      placeholder="—"
                      title="Calculado automaticamente pela maioria dos dias da jornada padrão"
                      className="w-full border rounded px-3 py-2 text-sm font-mono bg-gray-50 text-gray-700 cursor-not-allowed focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      Calculado automaticamente pela maioria dos dias da jornada padrão.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4 items-end">
                  <div>
                    <label htmlFor="adiantamento" className="block text-xs font-medium text-gray-600 mb-1">
                      Adiantamento
                    </label>
                    <div className="flex items-stretch border rounded overflow-hidden focus-within:ring-2 focus-within:ring-[#4A90D9]">
                      <span className="px-2 inline-flex items-center bg-gray-50 text-gray-500 text-sm font-medium border-r">
                        R$
                      </span>
                      <input
                        id="adiantamento"
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.adiantamento ?? 0}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value);
                          setField("adiantamento", Number.isFinite(n) && n >= 0 ? n : 0);
                        }}
                        className="flex-1 px-3 py-2 text-sm font-mono text-right focus:outline-none"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pb-2">
                    <input
                      type="checkbox"
                      id="transporte"
                      checked={form.transporte ?? false}
                      onChange={(e) => setField("transporte", e.target.checked)}
                      className="w-4 h-4 accent-[#4A90D9]"
                    />
                    <label htmlFor="transporte" className="text-sm text-gray-700">Transporte</label>
                  </div>
                  <div className="flex items-center gap-2 pb-2">
                    <input
                      type="checkbox"
                      id="ativo"
                      checked={form.ativo ?? true}
                      onChange={(e) => setField("ativo", e.target.checked)}
                      className="w-4 h-4 accent-[#4A90D9]"
                    />
                    <label htmlFor="ativo" className="text-sm text-gray-700">Ativo</label>
                  </div>
                </div>
              </section>

              {/* ----- Dados Pessoais ----- */}
              <section>
                <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3 border-b pb-1">
                  Dados Pessoais
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo *</label>
                    <input
                      type="text"
                      value={form.nome ?? ""}
                      onChange={(e) => setField("nome", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                      placeholder="Nome do funcionário"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Endereço</label>
                    <input
                      type="text"
                      value={form.endereco ?? ""}
                      onChange={(e) => setField("endereco", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                      placeholder="Rua / Avenida"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Número</label>
                    <input
                      type="text"
                      value={form.numero ?? ""}
                      onChange={(e) => setField("numero", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Bairro</label>
                    <input
                      type="text"
                      value={form.bairro ?? ""}
                      onChange={(e) => setField("bairro", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
                    <input
                      type="text"
                      value={form.cidade ?? ""}
                      onChange={(e) => setField("cidade", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CEP</label>
                    <input
                      type="text"
                      value={form.cep ?? ""}
                      onChange={(e) => setField("cep", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                      placeholder="00000-000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Estado civil</label>
                    <select
                      value={form.estado_civil ?? ""}
                      onChange={(e) => setField("estado_civil", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                    >
                      <option value="">— selecione —</option>
                      {ESTADOS_CIVIS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Raça / Cor</label>
                    <select
                      value={form.raca_cor ?? ""}
                      onChange={(e) => setField("raca_cor", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                    >
                      <option value="">— selecione —</option>
                      {RACAS_COR.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Horário</label>
                    <input
                      type="text"
                      value={form.horario ?? ""}
                      onChange={(e) => setField("horario", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                      placeholder="Ex: 08:00 às 17:00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Escolaridade</label>
                    <select
                      value={form.escolaridade ?? ""}
                      onChange={(e) => setField("escolaridade", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                    >
                      <option value="">— selecione —</option>
                      {ESCOLARIDADES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nº PIS</label>
                    <input
                      type="text"
                      value={form.pis ?? ""}
                      onChange={(e) => setField("pis", e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                      placeholder="000.00000.00-0"
                    />
                  </div>
                </div>
              </section>

              {/* ----- Jornada padrão ----- */}
              <section>
                <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3 border-b pb-1">
                  Jornada Padrão por Dia da Semana
                </h3>

                {/* Toggle: escala quinzenal */}
                <div className="mb-3 p-3 bg-[#F0F5FF] border border-[#D6E4FA] rounded">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!form.escala_quinzenal}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setField("escala_quinzenal", checked);
                        if (checked && !jornadasB.some((j) => j.entrada_padrao || j.saida_padrao || j.is_folga !== (j.dia_semana === 0 || j.dia_semana === 6))) {
                          setJornadasB(defaultJornadaSemanaB(jornadas));
                        }
                      }}
                      className="w-4 h-4 accent-[#4A90D9]"
                    />
                    <span className="text-sm font-medium text-[#1B2A4A]">
                      Escala quinzenal (alternada de 15 em 15 dias)
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    Útil para "sábado sim, sábado não" — vale para qualquer dia da semana.
                    Habilita uma segunda tabela (Semana B) que se alterna com a Semana A a cada 7 dias.
                  </p>
                  {form.escala_quinzenal && (
                    <div className="mt-3 ml-6 flex items-center gap-2">
                      <label className="text-xs font-medium text-gray-600">
                        Data de referência (Semana A):
                      </label>
                      <input
                        type="date"
                        value={form.quinzena_referencia ?? ""}
                        onChange={(e) => setField("quinzena_referencia", e.target.value)}
                        className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#4A90D9]"
                      />
                      <span className="text-xs text-gray-500">
                        (escolha uma data que cai numa semana "Semana A")
                      </span>
                    </div>
                  )}
                </div>

                {loadingJornadas ? (
                  <p className="text-xs text-gray-400">Carregando jornada...</p>
                ) : (
                  <>
                    {form.escala_quinzenal && (
                      <h4 className="text-xs font-semibold text-[#1B2A4A] mb-1.5 mt-2">
                        Semana A
                      </h4>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-2 py-1.5 text-left font-medium text-gray-600 w-20">Dia</th>
                            <th className="px-2 py-1.5 text-center font-medium text-gray-600">Entrada</th>
                            <th className="px-2 py-1.5 text-center font-medium text-gray-600">Saída</th>
                            <th className="px-2 py-1.5 text-center font-medium text-gray-600">Intervalo</th>
                            <th className="px-2 py-1.5 text-center font-medium text-gray-600">Folga</th>
                          </tr>
                        </thead>
                        <tbody>
                          {DIAS_SEMANA.map(({ num, label }) => {
                            const j = jornadas.find((x) => x.dia_semana === num)!;
                            return (
                              <tr key={num} className={`border-b ${j.is_folga ? "bg-gray-50 opacity-60" : ""}`}>
                                <td className="px-2 py-1.5 font-medium text-gray-700">{label}</td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={j.entrada_padrao}
                                    onChange={(e) => updateJornada(num, "entrada_padrao", maskHHMM(e.target.value, j.entrada_padrao))}
                                    disabled={j.is_folga}
                                    placeholder="08:00"
                                    className="w-full border rounded px-2 py-1 font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#4A90D9] disabled:bg-gray-100"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={j.saida_padrao}
                                    onChange={(e) => updateJornada(num, "saida_padrao", maskHHMM(e.target.value, j.saida_padrao))}
                                    disabled={j.is_folga}
                                    placeholder="17:00"
                                    className="w-full border rounded px-2 py-1 font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#4A90D9] disabled:bg-gray-100"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={j.intervalo_padrao}
                                    onChange={(e) => updateJornada(num, "intervalo_padrao", maskHHMM(e.target.value, j.intervalo_padrao))}
                                    disabled={j.is_folga}
                                    placeholder="01:00"
                                    className="w-full border rounded px-2 py-1 font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#4A90D9] disabled:bg-gray-100"
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={j.is_folga}
                                    onChange={(e) => updateJornada(num, "is_folga", e.target.checked)}
                                    className="w-4 h-4 accent-[#4A90D9]"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {form.escala_quinzenal && (
                      <>
                        <h4 className="text-xs font-semibold text-[#1B2A4A] mb-1.5 mt-4">
                          Semana B
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="px-2 py-1.5 text-left font-medium text-gray-600 w-20">Dia</th>
                                <th className="px-2 py-1.5 text-center font-medium text-gray-600">Entrada</th>
                                <th className="px-2 py-1.5 text-center font-medium text-gray-600">Saída</th>
                                <th className="px-2 py-1.5 text-center font-medium text-gray-600">Intervalo</th>
                                <th className="px-2 py-1.5 text-center font-medium text-gray-600">Folga</th>
                              </tr>
                            </thead>
                            <tbody>
                              {DIAS_SEMANA.map(({ num, label }) => {
                                const j = jornadasB.find((x) => x.dia_semana === num)!;
                                return (
                                  <tr key={num} className={`border-b ${j.is_folga ? "bg-gray-50 opacity-60" : ""}`}>
                                    <td className="px-2 py-1.5 font-medium text-gray-700">{label}</td>
                                    <td className="px-2 py-1.5">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={j.entrada_padrao}
                                        onChange={(e) => updateJornadaB(num, "entrada_padrao", maskHHMM(e.target.value, j.entrada_padrao))}
                                        disabled={j.is_folga}
                                        placeholder="08:00"
                                        className="w-full border rounded px-2 py-1 font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#4A90D9] disabled:bg-gray-100"
                                      />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={j.saida_padrao}
                                        onChange={(e) => updateJornadaB(num, "saida_padrao", maskHHMM(e.target.value, j.saida_padrao))}
                                        disabled={j.is_folga}
                                        placeholder="17:00"
                                        className="w-full border rounded px-2 py-1 font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#4A90D9] disabled:bg-gray-100"
                                      />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={j.intervalo_padrao}
                                        onChange={(e) => updateJornadaB(num, "intervalo_padrao", maskHHMM(e.target.value, j.intervalo_padrao))}
                                        disabled={j.is_folga}
                                        placeholder="01:00"
                                        className="w-full border rounded px-2 py-1 font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#4A90D9] disabled:bg-gray-100"
                                      />
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                      <input
                                        type="checkbox"
                                        checked={j.is_folga}
                                        onChange={(e) => updateJornadaB(num, "is_folga", e.target.checked)}
                                        className="w-4 h-4 accent-[#4A90D9]"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>

              {/* ----- Documentos ----- */}
              <section>
                <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3 border-b pb-1">
                  Documentos
                </h3>
                {!editId && (
                  <p className="text-xs text-gray-500 mb-2">
                    Salve o funcionário primeiro para anexar documentos.
                  </p>
                )}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleUploadFiles(e.dataTransfer.files);
                  }}
                  className={`border-2 border-dashed rounded-lg p-4 text-center text-sm text-gray-500 transition-colors ${
                    editId ? "border-gray-300 hover:bg-gray-50 cursor-pointer" : "border-gray-200 bg-gray-50"
                  }`}
                  onClick={() => editId && fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/jpg,image/png,application/pdf,.docx"
                    className="hidden"
                    onChange={(e) => handleUploadFiles(e.target.files)}
                    disabled={!editId}
                  />
                  {uploadingFile
                    ? "Enviando arquivo..."
                    : "Arraste arquivos aqui ou clique para selecionar (JPG, PNG, PDF, DOCX)"}
                </div>
                {uploadError && (
                  <p className="text-xs text-red-600 mt-2">{uploadError}</p>
                )}
                {arquivos.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {arquivos.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 px-3 py-2 border rounded bg-gray-50"
                      >
                        <span className="text-lg">{fileTypeIcon(a.tipo_arquivo)}</span>
                        <button
                          type="button"
                          onClick={() => handleDownloadArquivo(a)}
                          className="flex-1 text-left text-sm text-[#1B2A4A] hover:underline truncate"
                          title={a.nome_arquivo}
                        >
                          {a.nome_arquivo}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveArquivo(a.id)}
                          className="text-xs text-red-600 hover:text-red-800"
                          aria-label="Remover"
                        >
                          🗑️
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="p-6 border-t flex gap-2 justify-end">
              <button
                onClick={() => setDrawerOpen(false)}
                className="px-4 py-2 text-sm border rounded text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.nome || !form.codigo}
                className="px-4 py-2 text-sm bg-[#4A90D9] text-white rounded hover:bg-[#3A80C9] disabled:opacity-50"
              >
                {saving ? "Salvando..." : editId ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-base font-bold text-[#1B2A4A] mb-2">Confirmar desativação</h2>
            <p className="text-sm text-gray-600 mb-4">
              Tem certeza que deseja desativar este funcionário? Os registros de ponto serão preservados, mas o funcionário não aparecerá mais nas listas ativas.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm border rounded text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
              >
                Desativar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
