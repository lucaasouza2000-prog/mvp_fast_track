import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ user: vi.fn(), profile: vi.fn(), rpc: vi.fn() }));
vi.mock("../../apps/web/lib/server", () => ({
  serverSupabase: async () => ({
    auth: { getUser: m.user },
    from: () => {
      const q = { select: () => q, eq: () => q, single: m.profile };
      return q;
    },
    rpc: m.rpc,
  }),
}));
import { PATCH, DELETE } from "../../apps/web/app/api/rotas/route";
const id = "00000000-0000-4000-8000-000000000001";
const removal = { routes: [{ id, version: 2 }] };
const data = {
  code: "ROTA-01",
  driver_id: id,
  vehicle_id: id,
  scheduled_at: null,
  origin: { address: "Origem cadastrada", latitude: -23, longitude: -51 },
  deliveries: [
    {
      id,
      client_id: id,
      destination: {
        address: "Destino cadastrado",
        latitude: -23.1,
        longitude: -51.1,
      },
      cargo_code: "CARGA-1",
      description: "Carga",
      weight_kg: 100,
      volume_m3: null,
      fiscal_code: "NF-1",
    },
  ],
};
const req = (
  body: unknown,
  method = "DELETE",
  origin = "https://app.example",
) =>
  new NextRequest("https://app.example/api/rotas", {
    method,
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue({ data: { user: { id } } });
  m.profile.mockResolvedValue({ data: { role: "gestor", tenant_id: id } });
  m.rpc.mockResolvedValue({ data: 1, error: null });
});
describe("edição e exclusão de rotas", () => {
  it("publica o mesmo SQL validado nos testes de banco", () => {
    expect(readFileSync("apps/web/public/gestao-rotas.sql", "utf8")).toBe(
      readFileSync(
        "supabase/migrations/202611060001_route_management.sql",
        "utf8",
      ),
    );
  });
  it("exige sessão e papel do gestor", async () => {
    m.user.mockResolvedValueOnce({ data: { user: null } });
    expect((await DELETE(req(removal))).status).toBe(401);
    m.profile.mockResolvedValueOnce({
      data: { role: "motorista", tenant_id: id },
    });
    expect((await DELETE(req(removal))).status).toBe(403);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("recusa chamadas de outra origem e seleção vazia", async () => {
    expect(
      (await DELETE(req(removal, "DELETE", "https://foreign.example"))).status,
    ).toBe(403);
    expect((await DELETE(req({ routes: [] }))).status).toBe(400);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("envia apenas os IDs e versões validados para a transação autenticada", async () => {
    expect(
      (await DELETE(req({ ...removal, tenant_id: "foreign" }))).status,
    ).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith("archive_routes", {
      p_routes: removal.routes,
    });
  });
  it("valida a edição e preserva o vínculo das entregas", async () => {
    expect((await PATCH(req({ id, version: 2, data }, "PATCH"))).status).toBe(
      200,
    );
    expect(m.rpc).toHaveBeenCalledWith("update_route", {
      p_route_id: id,
      p_version: 2,
      payload: data,
    });
  });
  it("rejeita pesos inválidos antes da transação", async () => {
    expect(
      (
        await PATCH(
          req(
            {
              id,
              version: 2,
              data: {
                ...data,
                deliveries: [{ ...data.deliveries[0], weight_kg: -1 }],
              },
            },
            "PATCH",
          ),
        )
      ).status,
    ).toBe(400);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("orienta ativação quando a migration não foi aplicada", async () => {
    m.rpc.mockResolvedValue({
      error: { code: "PGRST202", message: "private schema cache details" },
    });
    const r = await DELETE(req(removal));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      setup: true,
      error: expect.stringContaining("Supabase"),
    });
  });
  it("devolve conflitos e não expõe erros internos", async () => {
    m.rpc.mockResolvedValueOnce({
      error: {
        code: "P0001",
        message: "A rota foi alterada. Atualize a lista antes de excluir",
      },
    });
    expect((await (await DELETE(req(removal))).json()).error).toContain(
      "Atualize",
    );
    m.rpc.mockResolvedValueOnce({
      error: { code: "XX000", message: "database password private" },
    });
    expect(
      JSON.stringify(await (await DELETE(req(removal))).json()),
    ).not.toContain("password");
  });
});
