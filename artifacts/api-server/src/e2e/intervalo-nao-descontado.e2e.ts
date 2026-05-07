/**
 * Testes de integração E2E para a flag `intervalo_nao_descontado` (estagiário).
 * Roda contra a API local em http://localhost:8080 via HTTP fetch.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run test:e2e
 */

const BASE = "http://localhost:8080/api";
const EMAIL = "admin@demo.com";
const SENHA = "admin123";
const EMPRESA_SLUG = "demo";
const TEST_DATE = "2024-03-18";
const TEST_MES = "2024-03";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, senha: SENHA, empresa_slug: EMPRESA_SLUG }),
  });
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Login falhou: " + JSON.stringify(data));
  return data.token;
}

let codeCounter = Date.now() % 900000 + 10000;
function nextCode(): number {
  return codeCounter++;
}

async function createFuncionario(
  token: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: number; [k: string]: unknown }> {
  const codigo = nextCode();
  const res = await fetch(`${BASE}/funcionarios`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      codigo,
      nome: `E2E Estagiario ${codigo}`,
      he_100_acima_2h: true,
      ...extra,
    }),
  });
  const data = (await res.json()) as { id: number; [k: string]: unknown };
  if (!data.id) throw new Error("Falha ao criar funcionário: " + JSON.stringify(data));
  return data;
}

async function upsertRegistro(
  token: string,
  funcionario_id: number,
  data: string,
  extra: Record<string, unknown> = {},
): Promise<{ id?: number; total_horas?: string | null; he_60?: string | null; [k: string]: unknown }> {
  const res = await fetch(`${BASE}/registros`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      funcionario_id,
      data,
      tipo_dia: "normal",
      entrada: "08:00",
      saida: "17:00",
      intervalo: "01:00",
      ...extra,
    }),
  });
  return res.json() as Promise<{ id?: number; total_horas?: string | null; he_60?: string | null }>;
}

async function updateFuncionario(
  token: string,
  id: number,
  body: Record<string, unknown>,
): Promise<{ registros_recalculados?: number; [k: string]: unknown }> {
  const res = await fetch(`${BASE}/funcionarios/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ registros_recalculados?: number }>;
}

async function getRegistros(
  token: string,
  funcionario_id: number,
  mes: string,
): Promise<Array<{ data: string; total_horas: string | null; [k: string]: unknown }>> {
  const res = await fetch(`${BASE}/funcionarios/${funcionario_id}/registros?mes=${mes}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { registros?: Array<{ data: string; total_horas: string | null }> };
  return body.registros ?? [];
}

async function run(): Promise<void> {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("E2E: intervalo_nao_descontado (estagiário)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const token = await login();
  console.log("Login OK\n");

  // ── Cenário 1: flag=true desde o cadastro ─────────────────────────────────
  console.log("Cenário 1: intervalo_nao_descontado=true desde o início");
  {
    const func = await createFuncionario(token, { intervalo_nao_descontado: true });
    assert(typeof func.id === "number", `funcionário criado (id=${func.id})`);

    // entrada=08:00, saida=17:00, intervalo=01:00
    // Com flag=true → intervalo NÃO descontado → trabalhadas = 9h
    // jornada_diaria fallback = 08:00 → extra = 1h → he_60 = "01:00"
    const reg = await upsertRegistro(token, func.id, TEST_DATE);
    assert(reg.total_horas === "09:00", `total_horas = "09:00" (obtido: ${reg.total_horas})`);
    assert(reg.he_60 === "01:00", `he_60 = "01:00" (obtido: ${reg.he_60})`);
  }

  // ── Cenário 2: flag=false → criar registro → ativar → verificar recálculo ─
  console.log("\nCenário 2: flag=false → registro → ativar flag → recalcular");
  {
    const func = await createFuncionario(token, { intervalo_nao_descontado: false });

    // flag=false → intervalo descontado → trabalhadas = 8h = jornada → sem HE, sem atraso
    const reg = await upsertRegistro(token, func.id, TEST_DATE);
    assert(reg.total_horas === "08:00", `total_horas inicial = "08:00" (obtido: ${reg.total_horas})`);
    assert(reg.he_60 === "00:00", `he_60 inicial = "00:00" (obtido: ${reg.he_60})`);

    // Ativar flag → deve recalcular registros existentes
    const updated = await updateFuncionario(token, func.id, { intervalo_nao_descontado: true });
    assert(
      typeof updated.registros_recalculados === "number" && updated.registros_recalculados > 0,
      `registros_recalculados > 0 após ativar (obtido: ${updated.registros_recalculados})`,
    );

    // Verificar que o registro no banco foi recalculado
    const registros = await getRegistros(token, func.id, TEST_MES);
    const r = registros.find((x) => x.data === TEST_DATE);
    assert(r?.total_horas === "09:00", `total_horas recalculado = "09:00" (obtido: ${r?.total_horas})`);
  }

  // ── Cenário 3: flag=true → criar registro → desativar → recálculo reverso ─
  console.log("\nCenário 3: flag=true → registro → desativar flag → recálculo reverso");
  {
    const func = await createFuncionario(token, { intervalo_nao_descontado: true });

    const reg = await upsertRegistro(token, func.id, TEST_DATE);
    assert(reg.total_horas === "09:00", `total_horas inicial com flag=true = "09:00" (obtido: ${reg.total_horas})`);

    // Desativar flag → deve recalcular para 8h
    const updated = await updateFuncionario(token, func.id, { intervalo_nao_descontado: false });
    assert(
      typeof updated.registros_recalculados === "number" && updated.registros_recalculados > 0,
      `registros_recalculados > 0 ao desativar (obtido: ${updated.registros_recalculados})`,
    );

    const registros = await getRegistros(token, func.id, TEST_MES);
    const r = registros.find((x) => x.data === TEST_DATE);
    assert(r?.total_horas === "08:00", `total_horas reverso = "08:00" (obtido: ${r?.total_horas})`);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`${passed + failed} testes: ${passed} passou, ${failed} falhou`);
  if (failed > 0) process.exit(1);
}

run().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
