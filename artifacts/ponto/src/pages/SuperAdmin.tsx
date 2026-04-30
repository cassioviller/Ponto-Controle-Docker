import { useEffect, useState, FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { baseUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Empresa {
  id: number;
  nome: string;
  cnpj: string | null;
  slug: string;
  plano: string;
  ativo: boolean;
}

interface Usuario {
  id: number;
  empresa_id: number | null;
  empresa_nome: string | null;
  empresa_slug: string | null;
  nome: string;
  email: string;
  role: string;
  ativo: boolean;
}

function getToken(): string | null {
  try {
    return localStorage.getItem("ponto.auth.token");
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export default function SuperAdmin() {
  const { user, logout, reloadEmpresas } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Empresa form
  const [eNome, setENome] = useState("");
  const [eSlug, setESlug] = useState("");
  const [eCnpj, setECnpj] = useState("");
  const [ePlano, setEPlano] = useState("basic");
  const [empresaSubmitting, setEmpresaSubmitting] = useState(false);

  // Usuario form
  const [uEmpresaId, setUEmpresaId] = useState<number | "">("");
  const [uNome, setUNome] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uSenha, setUSenha] = useState("");
  const [usuarioSubmitting, setUsuarioSubmitting] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [emps, users] = await Promise.all([
        apiFetch<Empresa[]>("/api/admin/empresas"),
        apiFetch<Usuario[]>("/api/admin/usuarios"),
      ]);
      setEmpresas(emps);
      setUsuarios(users);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  if (!user || user.role !== "super_admin") {
    return (
      <div className="p-8 text-center text-[#1B2A4A]">
        Acesso restrito ao super administrador.
      </div>
    );
  }

  async function createEmpresa(ev: FormEvent) {
    ev.preventDefault();
    setEmpresaSubmitting(true);
    setError(null);
    try {
      await apiFetch<Empresa>("/api/admin/empresas", {
        method: "POST",
        body: JSON.stringify({
          nome: eNome.trim(),
          slug: eSlug.trim(),
          cnpj: eCnpj.trim() || null,
          plano: ePlano,
        }),
      });
      setENome("");
      setESlug("");
      setECnpj("");
      setEPlano("basic");
      await reload();
      await reloadEmpresas();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEmpresaSubmitting(false);
    }
  }

  async function createUsuario(ev: FormEvent) {
    ev.preventDefault();
    if (uEmpresaId === "") return;
    setUsuarioSubmitting(true);
    setError(null);
    try {
      await apiFetch<Usuario>("/api/admin/usuarios", {
        method: "POST",
        body: JSON.stringify({
          empresa_id: Number(uEmpresaId),
          nome: uNome.trim(),
          email: uEmail.trim(),
          senha: uSenha,
        }),
      });
      setUNome("");
      setUEmail("");
      setUSenha("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUsuarioSubmitting(false);
    }
  }

  async function toggleEmpresaAtivo(emp: Empresa) {
    setError(null);
    try {
      await apiFetch<Empresa>(`/api/admin/empresas/${emp.id}`, {
        method: "PUT",
        body: JSON.stringify({ ativo: !emp.ativo }),
      });
      await reload();
      await reloadEmpresas();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleUsuarioAtivo(u: Usuario) {
    setError(null);
    try {
      await apiFetch<Usuario>(`/api/admin/usuarios/${u.id}`, {
        method: "PUT",
        body: JSON.stringify({ ativo: !u.ativo }),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F6F8]">
      <header className="bg-[#1B2A4A] text-white px-6 py-4 flex items-center justify-between shadow">
        <div>
          <div className="text-xs font-bold tracking-widest text-[#4A90D9] uppercase">
            Super Admin
          </div>
          <h1 className="font-bold text-lg">Gestão de Empresas e Usuários</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#A8BDD4]">{user.email}</span>
          <Button variant="secondary" size="sm" onClick={logout}>
            Sair
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-8">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-2">
            {error}
          </div>
        )}

        <section className="bg-white rounded-xl shadow border border-[#E1E7EE] p-6">
          <h2 className="text-[#1B2A4A] font-bold text-base mb-4">Nova Empresa (Tenant)</h2>
          <form onSubmit={createEmpresa} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eNome">Nome</Label>
              <Input id="eNome" required value={eNome} onChange={(e) => setENome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eSlug">Slug</Label>
              <Input
                id="eSlug"
                required
                value={eSlug}
                onChange={(e) => setESlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="acme"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eCnpj">CNPJ (opcional)</Label>
              <Input id="eCnpj" value={eCnpj} onChange={(e) => setECnpj(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ePlano">Plano</Label>
              <Input id="ePlano" value={ePlano} onChange={(e) => setEPlano(e.target.value)} />
            </div>
            <div className="md:col-span-4">
              <Button type="submit" disabled={empresaSubmitting}>
                {empresaSubmitting ? "Criando..." : "Criar empresa"}
              </Button>
            </div>
          </form>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#5C6E84] border-b">
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Slug</th>
                  <th className="py-2 pr-4">CNPJ</th>
                  <th className="py-2 pr-4">Plano</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Ação</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="py-4 text-center text-[#5C6E84]">Carregando...</td></tr>
                ) : empresas.length === 0 ? (
                  <tr><td colSpan={7} className="py-4 text-center text-[#5C6E84]">Nenhuma empresa.</td></tr>
                ) : (
                  empresas.map((e) => (
                    <tr key={e.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4">{e.id}</td>
                      <td className="py-2 pr-4 font-medium text-[#1B2A4A]">{e.nome}</td>
                      <td className="py-2 pr-4">{e.slug}</td>
                      <td className="py-2 pr-4">{e.cnpj ?? "—"}</td>
                      <td className="py-2 pr-4">{e.plano}</td>
                      <td className="py-2 pr-4">
                        <span className={e.ativo ? "text-green-700" : "text-gray-500"}>
                          {e.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <Button size="sm" variant="outline" onClick={() => toggleEmpresaAtivo(e)}>
                          {e.ativo ? "Desativar" : "Ativar"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow border border-[#E1E7EE] p-6">
          <h2 className="text-[#1B2A4A] font-bold text-base mb-4">Novo Usuário Admin (Tenant)</h2>
          <form onSubmit={createUsuario} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="uEmpresa">Empresa</Label>
              <select
                id="uEmpresa"
                required
                value={uEmpresaId}
                onChange={(e) => setUEmpresaId(e.target.value ? Number(e.target.value) : "")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">Selecione...</option>
                {empresas
                  .filter((e) => e.ativo)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome} ({e.slug})
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uNome">Nome</Label>
              <Input id="uNome" required value={uNome} onChange={(e) => setUNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uEmail">E-mail</Label>
              <Input
                id="uEmail"
                type="email"
                required
                value={uEmail}
                onChange={(e) => setUEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uSenha">Senha</Label>
              <Input
                id="uSenha"
                type="text"
                required
                minLength={6}
                value={uSenha}
                onChange={(e) => setUSenha(e.target.value)}
              />
            </div>
            <div className="md:col-span-4">
              <Button type="submit" disabled={usuarioSubmitting}>
                {usuarioSubmitting ? "Criando..." : "Criar usuário"}
              </Button>
            </div>
          </form>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#5C6E84] border-b">
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">Empresa</th>
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">E-mail</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Ação</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="py-4 text-center text-[#5C6E84]">Carregando...</td></tr>
                ) : usuarios.length === 0 ? (
                  <tr><td colSpan={7} className="py-4 text-center text-[#5C6E84]">Nenhum usuário.</td></tr>
                ) : (
                  usuarios.map((u) => (
                    <tr key={u.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4">{u.id}</td>
                      <td className="py-2 pr-4">{u.empresa_nome ?? "—"}</td>
                      <td className="py-2 pr-4 font-medium text-[#1B2A4A]">{u.nome}</td>
                      <td className="py-2 pr-4">{u.email}</td>
                      <td className="py-2 pr-4">{u.role}</td>
                      <td className="py-2 pr-4">
                        <span className={u.ativo ? "text-green-700" : "text-gray-500"}>
                          {u.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <Button size="sm" variant="outline" onClick={() => toggleUsuarioAtivo(u)}>
                          {u.ativo ? "Desativar" : "Ativar"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
