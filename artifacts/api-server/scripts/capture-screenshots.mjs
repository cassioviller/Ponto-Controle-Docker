#!/usr/bin/env node
/**
 * Captura screenshots do sistema rodando em dev e salva em
 * artifacts/api-server/src/manual/screenshots/.
 *
 * Pré-requisitos:
 *   - Workflows artifacts/api-server e artifacts/ponto rodando.
 *   - Usuários seed: admin@demo.com / admin123 e super@admin.com / super123.
 *
 * Uso:
 *   node artifacts/api-server/scripts/capture-screenshots.mjs
 */
import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../src/manual/screenshots");

const PONTO_BASE = process.env.PONTO_BASE_URL ?? "http://localhost:22875";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8080";

const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 };

async function loginViaApi(email, senha) {
  const resp = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Login falhou (${email}): HTTP ${resp.status} ${t}`);
  }
  return await resp.json();
}

async function getFirstFuncionarioId(token, empresaId) {
  const resp = await fetch(`${API_BASE}/api/funcionarios?ativo=true`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Empresa-Id": String(empresaId),
    },
  });
  if (!resp.ok) {
    throw new Error(`Falha ao listar funcionários: HTTP ${resp.status}`);
  }
  const list = await resp.json();
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("Nenhum funcionário no seed");
  }
  return list[0].id;
}

async function setAuthInPage(page, { token, empresaId }) {
  // Set localStorage BEFORE navigation by using an init script.
  await page.evaluateOnNewDocument(
    (t, e) => {
      try {
        localStorage.setItem("ponto.auth.token", t);
        if (e != null) localStorage.setItem("ponto.auth.activeEmpresaId", String(e));
      } catch {
        /* noop */
      }
    },
    token,
    empresaId,
  );
}

async function clearAuth(page) {
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.removeItem("ponto.auth.token");
      localStorage.removeItem("ponto.auth.activeEmpresaId");
    } catch {
      /* noop */
    }
  });
}

async function shoot(page, file, opts = {}) {
  const out = path.join(OUT_DIR, file);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: out, fullPage: false, type: "png", ...opts });
  console.log(`  ✓ ${file}`);
}

async function gotoAndWait(page, url, waitSelector) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  if (waitSelector) {
    await page.waitForSelector(waitSelector, { timeout: 15000 });
  }
  // Small settle delay for fonts/images.
  await new Promise((r) => setTimeout(r, 400));
}

async function main() {
  console.log(`API: ${API_BASE}`);
  console.log(`PONTO: ${PONTO_BASE}`);
  console.log(`Output: ${OUT_DIR}`);

  // Login admin@demo.com
  const adminLogin = await loginViaApi("admin@demo.com", "admin123");
  const adminToken = adminLogin.token;
  const empresaId = adminLogin.usuario.empresa_id;
  console.log(`Admin logged in (empresa_id=${empresaId})`);

  // Login super admin
  const superLogin = await loginViaApi("super@admin.com", "super123");
  const superToken = superLogin.token;
  console.log("Super admin logged in");

  // Find a real funcionario id
  const funcId = await getFirstFuncionarioId(adminToken, empresaId);
  console.log(`Using funcionario_id=${funcId} for Folha Individual`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // 1) Login screen (no auth)
    {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await clearAuth(page);
      await gotoAndWait(page, `${PONTO_BASE}/login`, "input[type=email]");
      await shoot(page, "login.png");
      await page.close();
    }

    // 2) Bater Ponto
    {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await setAuthInPage(page, { token: adminToken, empresaId });
      await gotoAndWait(page, `${PONTO_BASE}/bater-ponto`, "select");
      await shoot(page, "bater-ponto.png");
      await page.close();
    }

    // 3) Resumo (home)
    {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await setAuthInPage(page, { token: adminToken, empresaId });
      await gotoAndWait(page, `${PONTO_BASE}/`, "table");
      await shoot(page, "resumo.png");
      await page.close();
    }

    // 4) Consolidado
    {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await setAuthInPage(page, { token: adminToken, empresaId });
      await gotoAndWait(page, `${PONTO_BASE}/consolidado`, "table");
      await shoot(page, "consolidado.png");
      await page.close();
    }

    // 5) Funcionarios list
    {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await setAuthInPage(page, { token: adminToken, empresaId });
      await gotoAndWait(page, `${PONTO_BASE}/funcionarios`, "table");
      await shoot(page, "funcionarios-lista.png");
      await page.close();
    }

    // Helper: open the Edit drawer by clicking the first row's "Editar" button.
    async function openFirstFuncionarioDrawer(page) {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("tbody tr button"));
        const editBtn = buttons.find((b) => /editar/i.test(b.textContent ?? ""));
        if (editBtn) {
          editBtn.click();
          return true;
        }
        return false;
      });
      if (!clicked) throw new Error("Não encontrei botão Editar na lista");
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 6) Drawer cadastro (Novo Funcionário visual)
    {
      const page = await browser.newPage();
      await page.setViewport({ ...VIEWPORT, height: 1100 });
      await setAuthInPage(page, { token: adminToken, empresaId });
      await gotoAndWait(page, `${PONTO_BASE}/funcionarios`, "tbody tr");
      await openFirstFuncionarioDrawer(page);
      await shoot(page, "funcionario-novo.png");
      await page.close();
    }

    // 7) Jornada Padrão (drawer scrolled to that section, escala quinzenal off)
    {
      const page = await browser.newPage();
      await page.setViewport({ ...VIEWPORT, height: 1400 });
      await setAuthInPage(page, { token: adminToken, empresaId });
      await gotoAndWait(page, `${PONTO_BASE}/funcionarios`, "tbody tr");
      await openFirstFuncionarioDrawer(page);
      await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll("h2, h3, h4"));
        const target = headings.find((h) => /Jornada Padr/i.test(h.textContent ?? ""));
        if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
      });
      await new Promise((r) => setTimeout(r, 400));
      await shoot(page, "jornada-padrao.png");

      // Toggle escala quinzenal on (native checkbox inside the toggle label)
      const toggled = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll("label"));
        const lbl = labels.find((l) => /Escala\s+quinzenal/i.test(l.textContent ?? ""));
        if (!lbl) return { ok: false, reason: "label não encontrado" };
        const cb = lbl.querySelector('input[type="checkbox"]');
        if (!cb) return { ok: false, reason: "checkbox dentro do label não encontrado" };
        if (!cb.checked) cb.click();
        return { ok: true, reason: "ok", checked: cb.checked };
      });
      if (toggled.ok) {
        await new Promise((r) => setTimeout(r, 600));
        // Set the reference date (required by save validation) — even though
        // we don't save, this triggers any reactive UI that depends on it.
        await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="date"]'));
          const refDate = inputs[inputs.length - 1];
          if (refDate) {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value",
            )?.set;
            setter?.call(refDate, "2026-05-04");
            refDate.dispatchEvent(new Event("input", { bubbles: true }));
            refDate.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
        await new Promise((r) => setTimeout(r, 400));
        await page.evaluate(() => {
          const headings = Array.from(document.querySelectorAll("h2, h3, h4, label"));
          const target = headings.find((h) => /Semana\s+A/i.test(h.textContent ?? ""));
          if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
        });
        await new Promise((r) => setTimeout(r, 400));
        await shoot(page, "escala-quinzenal.png");
      } else {
        console.log(`  ! Não consegui ativar Escala Quinzenal: ${toggled.reason}`);
      }
      await page.close();
    }

    // 8) Folha Individual
    {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await setAuthInPage(page, { token: adminToken, empresaId });
      await gotoAndWait(page, `${PONTO_BASE}/funcionario/${funcId}`, "table");
      await shoot(page, "folha-individual.png");
      await page.close();
    }

    // 9) Super Admin
    {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await setAuthInPage(page, { token: superToken, empresaId: null });
      await gotoAndWait(page, `${PONTO_BASE}/super-admin`, "form");
      await shoot(page, "super-admin.png");
      await page.close();
    }

    console.log("\nDone.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
