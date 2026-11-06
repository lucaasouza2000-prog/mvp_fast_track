import { describe, expect, it } from "vitest";
import { assessBackend } from "../../apps/web/lib/readiness";
const env = {
  url: "https://project.supabase.co",
  publicKey: "public-example",
  secretKey: "SECRET-MUST-NOT-LEAK",
};
const fake =
  (handler: (url: string, init?: RequestInit) => Response): typeof fetch =>
  async (input, init) =>
    handler(String(input), init);
describe("diagnóstico do backend", () => {
  it("exige configuração antes de qualquer chamada externa", async () => {
    let calls = 0;
    const r = await assessBackend(
      {},
      fake(() => {
        calls++;
        return Response.json({});
      }),
    );
    expect(calls).toBe(0);
    expect(r.backendReady).toBe(false);
    expect(r.checks[0].state).toBe("pending");
  });
  it("distingue bloqueio de rede de migration ausente", async () => {
    const r = await assessBackend(env, async () => {
      throw new Error("proxy");
    });
    expect(r.checks.find((c) => c.id === "auth")?.state).toBe("error");
    expect(r.checks.some((c) => c.id === "tables")).toBe(false);
  });
  it("encontra tabelas ausentes e não mostra mensagens remotas nem credenciais", async () => {
    const r = await assessBackend(
      env,
      fake((url) =>
        url.includes("/auth/")
          ? Response.json({ disable_signup: true })
          : Response.json(
              { code: "PGRST205", message: env.secretKey },
              { status: 404 },
            ),
      ),
    );
    expect(r.checks.find((c) => c.id === "tables")?.state).toBe("pending");
    expect(JSON.stringify(r)).not.toContain(env.secretKey);
    expect(r.backendReady).toBe(false);
  });
  it("reconhece SELECT revogado para anônimos e verifica o gestor somente com a chave de servidor", async () => {
    let sawSecret = false;
    const r = await assessBackend(
      env,
      fake((url, init) => {
        const key = (init?.headers as Record<string, string>).apikey;
        if (url.includes("/auth/"))
          return Response.json({ disable_signup: true });
        if (key === env.secretKey) {
          sawSecret = true;
          return Response.json([{ id: "PRIVATE-ID" }]);
        }
        return Response.json({ code: "42501" }, { status: 401 });
      }),
    );
    expect(sawSecret).toBe(true);
    expect(r.backendReady).toBe(true);
    expect(JSON.stringify(r)).not.toContain(env.secretKey);
    expect(JSON.stringify(r)).not.toContain("PRIVATE-ID");
  });
  it("mantém primeiro gestor como pendente quando o banco não possui perfil", async () => {
    const r = await assessBackend(
      env,
      fake((url, init) =>
        url.includes("/auth/")
          ? Response.json({ disable_signup: true })
          : (init?.headers as Record<string, string>).apikey === env.secretKey
            ? Response.json([])
            : Response.json({ code: "42501" }, { status: 401 }),
      ),
    );
    expect(r.checks.find((c) => c.id === "manager")?.state).toBe("pending");
    expect(r.backendReady).toBe(false);
  });
});
