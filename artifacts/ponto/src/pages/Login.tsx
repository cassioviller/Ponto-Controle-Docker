import { useState, FormEvent, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { login, user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [empresaSlug, setEmpresaSlug] = useState("");
  const [showSlug, setShowSlug] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      navigate(user.role === "super_admin" ? "/super-admin" : "/", { replace: true });
    }
  }, [user, loading, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({
        email: email.trim(),
        senha,
        empresa_slug: empresaSlug.trim() || undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha no login";
      if (/empresa/i.test(msg)) setShowSlug(true);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8] px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg border border-[#E1E7EE] p-8">
        <div className="mb-6 text-center">
          <div className="text-xs font-bold tracking-widest text-[#4A90D9] uppercase mb-1">
            Sistema
          </div>
          <h1 className="text-[#1B2A4A] font-bold text-xl leading-tight">
            Controle de Ponto
          </h1>
          <p className="text-sm text-[#5C6E84] mt-2">Entre com suas credenciais</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {showSlug && (
            <div className="space-y-1.5">
              <Label htmlFor="empresa_slug">Empresa (slug)</Label>
              <Input
                id="empresa_slug"
                value={empresaSlug}
                onChange={(e) => setEmpresaSlug(e.target.value)}
                placeholder="demo"
              />
              <p className="text-xs text-[#5C6E84]">
                Informe o slug da empresa quando o e-mail é usado em mais de uma.
              </p>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Entrando..." : "Entrar"}
          </Button>

          {!showSlug && (
            <button
              type="button"
              onClick={() => setShowSlug(true)}
              className="w-full text-xs text-[#4A90D9] hover:underline"
            >
              Informar empresa manualmente
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
