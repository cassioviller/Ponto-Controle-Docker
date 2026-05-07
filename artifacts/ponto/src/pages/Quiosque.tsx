import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useGetKioskAdminToday, useRotateKioskToken } from "@workspace/api-client-react";
import type { KioskAdminToken } from "@workspace/api-client-react";

function getKioskUrl(token: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const origin = window.location.origin;
  const basePath = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${origin}${basePath}/kiosk/${token}`;
}

function getMsToMidnightBR(): number {
  const now = new Date();
  const brNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const brMidnight = new Date(brNow);
  brMidnight.setHours(24, 0, 0, 0);
  return Math.max(0, brMidnight.getTime() - brNow.getTime());
}

function getTimeUntilMidnight(): string {
  const diff = getMsToMidnightBR();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}min`;
}

export default function Quiosque() {
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(getTimeUntilMidnight());

  const { data, refetch, isLoading } = useGetKioskAdminToday({
    query: { queryKey: ["kioskAdminToday"], refetchOnWindowFocus: false },
  });
  const rotate = useRotateKioskToken();

  const tokenData = data as KioskAdminToken | undefined;

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeUntilMidnight()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!tokenData) return;
    const msLeft = getMsToMidnightBR();
    const id = setTimeout(() => refetch(), msLeft + 1500);
    return () => clearTimeout(id);
  }, [tokenData, refetch]);

  const kioskUrl = tokenData ? getKioskUrl(tokenData.token) : "";

  async function handleCopy() {
    if (!kioskUrl) return;
    await navigator.clipboard.writeText(kioskUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const handleRotate = useCallback(async () => {
    if (!confirm("Isso irá invalidar o link atual. Funcionários com o link antigo não conseguirão bater ponto até receberem o novo. Continuar?")) return;
    await rotate.mutateAsync();
    await refetch();
  }, [rotate, refetch]);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1B2A4A]">Quiosque de Ponto</h1>
        <p className="text-gray-500 text-sm mt-1">
          Compartilhe o link abaixo com os funcionários. O link muda automaticamente à meia-noite.
        </p>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-400">Gerando link do dia...</div>
      )}

      {tokenData && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border p-6 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-[#4A90D9] uppercase tracking-wide">Link do dia</span>
              <span className="text-xs text-gray-400 bg-gray-100 rounded px-2 py-0.5">
                Expira em {timeLeft}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                readOnly
                value={kioskUrl}
                className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono text-gray-700 bg-[#F4F6F8] focus:outline-none"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={handleCopy}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  copied
                    ? "bg-[#1B7A3E] text-white"
                    : "bg-[#4A90D9] text-white hover:bg-[#3A80C9]"
                }`}
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-6 mb-4 flex flex-col items-center">
            <p className="text-sm font-semibold text-[#1B2A4A] mb-4">QR Code — escaneie para abrir no celular ou tablet</p>
            <div className="p-4 border-2 border-dashed border-gray-200 rounded-xl">
              <QRCodeSVG value={kioskUrl} size={200} />
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Válido para: {tokenData.valid_date.split("-").reverse().join("/")}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-6 mb-4">
            <h3 className="font-semibold text-[#1B2A4A] mb-1 text-sm">Como usar</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>Abra o link (ou escaneie o QR) em um tablet ou computador da recepção.</li>
              <li>O funcionário seleciona o nome e clica no botão correspondente (Entrada, Intervalo, Saída).</li>
              <li>O sistema registra automaticamente o horário atual.</li>
              <li>O link expira à meia-noite e é gerado um novo automaticamente no próximo acesso.</li>
            </ul>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h3 className="font-semibold text-amber-800 text-sm mb-1">Suspeita de vazamento?</h3>
            <p className="text-amber-700 text-xs mb-3">
              Se acredita que o link de hoje foi compartilhado indevidamente, gere um novo. O link anterior deixará de funcionar imediatamente.
            </p>
            <button
              onClick={handleRotate}
              disabled={rotate.isPending}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {rotate.isPending ? "Gerando..." : "Gerar novo link agora"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
