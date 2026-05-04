import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn, downloadAuthenticatedFile } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { href: "/", label: "Resumo Geral", icon: "⊞" },
  { href: "/consolidado", label: "Consolidado", icon: "≡" },
  { href: "/bater-ponto", label: "Bater Ponto", icon: "◉" },
  { href: "/funcionarios", label: "Funcionários", icon: "✦" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, empresa, logout } = useAuth();
  const [downloadingManual, setDownloadingManual] = useState(false);

  async function handleDownloadManual() {
    if (downloadingManual) return;
    setDownloadingManual(true);
    try {
      await downloadAuthenticatedFile("/api/manual.pdf", "manual-controle-de-ponto.pdf");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao baixar o manual");
    } finally {
      setDownloadingManual(false);
    }
  }

  return (
    <div className="flex h-screen bg-[#F4F6F8] overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-[#1B2A4A] flex flex-col shadow-xl">
        <div className="px-5 py-5 border-b border-[#253857]">
          <div className="text-xs font-bold tracking-widest text-[#4A90D9] uppercase mb-0.5">
            Sistema
          </div>
          <div className="text-white font-bold text-lg leading-tight">
            Controle<br />de Ponto
          </div>
          {empresa && (
            <div className="text-[#A8BDD4] text-xs mt-2 truncate" title={empresa.nome}>
              {empresa.nome}
            </div>
          )}
        </div>

        <nav className="flex-1 py-3">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? location === "/"
                : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-all duration-150 cursor-pointer",
                  isActive
                    ? "bg-[#4A90D9] text-white"
                    : "text-[#A8BDD4] hover:bg-[#253857] hover:text-white",
                )}
              >
                <span className="text-base w-5 text-center leading-none">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
          {user?.role === "super_admin" && (
            <Link
              href="/super-admin"
              className="flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-[#A8BDD4] hover:bg-[#253857] hover:text-white cursor-pointer"
            >
              <span className="text-base w-5 text-center leading-none">⚙</span>
              Super Admin
            </Link>
          )}
        </nav>

        <div className="px-5 py-4 border-t border-[#253857] space-y-2">
          {user && (
            <div className="text-[#A8BDD4] text-xs truncate" title={user.email}>
              {user.email}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleDownloadManual}
              disabled={downloadingManual}
              className="text-[#A8BDD4] hover:text-white text-xs font-medium disabled:opacity-50"
              title="Baixar Manual do Usuário (PDF)"
            >
              {downloadingManual ? "Baixando..." : "📘 Baixar Manual"}
            </button>
            <button
              type="button"
              onClick={logout}
              className="text-[#4A90D9] hover:text-white text-xs font-medium"
            >
              Sair
            </button>
          </div>
          <div className="text-[#4A6A8A] text-xs">v1.0.0</div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
