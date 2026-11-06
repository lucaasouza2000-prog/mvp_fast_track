export type CheckState = "ok" | "pending" | "error" | "unverified";
export interface ReadinessCheck {
  id: string;
  title: string;
  state: CheckState;
  message: string;
}
export interface ReadinessReport {
  checkedAt: string;
  backendReady: boolean;
  checks: ReadinessCheck[];
}
export interface BackendEnvironment {
  url?: string;
  publicKey?: string;
  secretKey?: string;
}
export async function assessBackend(
  env: BackendEnvironment,
  request: typeof fetch = fetch,
): Promise<ReadinessReport> {
  const checks: ReadinessCheck[] = [];
  const add = (id: string, title: string, state: CheckState, message: string) =>
    checks.push({ id, title, state, message });
  const result = () => ({
    checkedAt: new Date().toISOString(),
    backendReady: checks.every((c) => c.state === "ok"),
    checks,
  });
  let base: URL;
  try {
    base = new URL(env.url ?? "");
    if (base.protocol !== "https:" || base.pathname !== "/") throw new Error();
  } catch {
    add(
      "public-config",
      "Conexão pública",
      "pending",
      "Configure NEXT_PUBLIC_SUPABASE_URL com a URL base HTTPS do projeto, sem /rest/v1/, e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel.",
    );
    return result();
  }
  if (!env.publicKey) {
    add(
      "public-config",
      "Conexão pública",
      "pending",
      "Preencha NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel com a chave pública do projeto e faça um novo deploy.",
    );
    return result();
  }
  add(
    "public-config",
    "Conexão pública",
    "ok",
    "URL base e chave pública estão presentes neste servidor.",
  );
  async function probe(path: string, key: string) {
    const response = await request(new URL(path, base), {
      headers: { apikey: key, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  }
  let auth: { status: number; data: any };
  try {
    auth = await probe("/auth/v1/settings", env.publicKey);
  } catch {
    add(
      "auth",
      "Supabase Auth",
      "error",
      "O servidor não conseguiu alcançar o Supabase. Verifique a URL, a disponibilidade do projeto e a rede.",
    );
    return result();
  }
  if (auth.status !== 200) {
    add(
      "auth",
      "Supabase Auth",
      "error",
      "A chave pública não foi aceita ou o projeto está indisponível. Confira as variáveis na Vercel.",
    );
    return result();
  }
  add(
    "auth",
    "Supabase Auth",
    "ok",
    "O serviço de autenticação respondeu usando a chave pública.",
  );
  add(
    "signup",
    "Cadastro público",
    auth.data?.disable_signup === true ? "ok" : "pending",
    auth.data?.disable_signup === true
      ? "Novos cadastros públicos estão desativados."
      : "No Supabase, abra Authentication → Sign In / Providers e desative a opção que permite novos cadastros públicos.",
  );
  const tables = [
    "tenants",
    "profiles",
    "drivers",
    "vehicles",
    "clients",
    "routes",
    "stops",
    "deliveries",
    "fiscal_documents",
    "operational_events",
    "positions",
    "audit_log",
  ];
  let tablesReady = false;
  try {
    const outcomes = await Promise.all(
      tables.map(async (table) => ({
        table,
        ...(await probe(`/rest/v1/${table}?select=id&limit=0`, env.publicKey!)),
      })),
    );
    const missing = outcomes.filter(
      (r) => r.data?.code === "PGRST205" || r.data?.code === "42P01",
    );
    const unexpected = outcomes.filter(
      (r) =>
        r.status !== 200 &&
        !(r.status === 401 || r.status === 403) &&
        r.data?.code !== "42501" &&
        !missing.includes(r),
    );
    // SELECT is deliberately revoked from anonymous users in the migration.
    tablesReady =
      missing.length === 0 &&
      unexpected.length === 0 &&
      outcomes.every((r) => r.status === 200 || r.data?.code === "42501");
    if (missing.length)
      add(
        "tables",
        "Tabelas do FastTrack",
        "pending",
        `Aplique a migration no SQL Editor do Supabase. Tabelas não encontradas: ${missing.map((r) => r.table).join(", ")}.`,
      );
    else if (!tablesReady)
      add(
        "tables",
        "Tabelas do FastTrack",
        "error",
        "Não foi possível confirmar as tabelas. Verifique a migration, as permissões e o cache do PostgREST.",
      );
    else
      add(
        "tables",
        "Tabelas do FastTrack",
        "ok",
        "As 12 tabelas do FastTrack foram encontradas. A autorização entre usuários ainda deve ser validada no fluxo autenticado.",
      );
  } catch {
    add(
      "tables",
      "Tabelas do FastTrack",
      "error",
      "A consulta de estrutura não foi concluída. Verifique a conectividade do projeto.",
    );
  }
  if (!env.secretKey) {
    add(
      "admin",
      "Cadastro de motoristas",
      "pending",
      "Cadastre SUPABASE_SERVICE_ROLE_KEY nas variáveis de servidor da Vercel com uma Secret API key do mesmo projeto. Não use prefixos NEXT_PUBLIC_ ou EXPO_PUBLIC_.",
    );
    add(
      "manager",
      "Primeiro gestor",
      "unverified",
      "Crie o usuário no Supabase Auth e vincule seu perfil de gestor com o SQL abaixo. O login ainda precisa ser testado.",
    );
    return result();
  }
  if (!tablesReady) {
    add(
      "admin",
      "Cadastro de motoristas",
      "unverified",
      "A chave administrativa está presente; sua permissão só será testada após confirmar as tabelas.",
    );
    return result();
  }
  try {
    const p = await probe(
      "/rest/v1/profiles?select=id&role=eq.gestor&limit=1",
      env.secretKey,
    );
    if (p.status !== 200 || !Array.isArray(p.data)) {
      add(
        "admin",
        "Cadastro de motoristas",
        "error",
        "A chave administrativa não conseguiu consultar os perfis. Confira a Secret API key e as permissões.",
      );
      return result();
    }
    add(
      "admin",
      "Cadastro de motoristas",
      "ok",
      "A chave administrativa conseguiu acessar os perfis pelo servidor. Nenhum valor da chave é exibido ou enviado ao navegador.",
    );
    add(
      "manager",
      "Primeiro gestor",
      p.data.length ? "ok" : "pending",
      p.data.length
        ? "Existe um perfil de gestor. Valide o login e o isolamento de acesso antes de operar."
        : "Nenhum gestor foi encontrado. Crie o usuário no Supabase Auth e execute o SQL de vinculação abaixo.",
    );
  } catch {
    add(
      "admin",
      "Cadastro de motoristas",
      "error",
      "Não foi possível verificar o acesso administrativo. Tente novamente após conferir a rede.",
    );
  }
  return result();
}
