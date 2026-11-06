import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({
  session: vi.fn(),
  profile: vi.fn(),
  route: vi.fn(),
  position: vi.fn(),
  lookup: vi.fn(),
  tokens: [] as (string | undefined)[],
  filters: [] as { table: string; field: string; value: string }[],
}));
vi.mock("../../apps/web/lib/server", () => ({
  serverSupabase: async (token?: string) => {
    m.tokens.push(token);
    return {
      auth: { getUser: m.session },
      from: (table: string) => {
        const builder = {
          select: () => builder,
          eq: (field: string, value: string) => {
            m.filters.push({ table, field, value });
            return builder;
          },
          order: () => builder,
          limit: () => builder,
          single: () => m.profile(),
          maybeSingle: () => (table === "positions" ? m.position() : m.route()),
        };
        return builder;
      },
    };
  },
}));
vi.mock("../../apps/web/lib/routing", async (original) => ({
  ...(await original<typeof import("../../apps/web/lib/routing")>()),
  lookupRoadRoute: m.lookup,
}));
import { GET } from "../../apps/web/app/api/trajeto/route";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
let count = 100;
let routeId = "";
let row: any;
beforeEach(() => {
  vi.resetAllMocks();
  m.tokens.length = 0;
  m.filters.length = 0;
  routeId = id(++count);
  row = {
    id: routeId,
    tenant_id: id(1),
    driver_id: id(3),
    status: "ativa",
    origin_lat: -23.3,
    origin_lng: -51.2,
    stops: [{ id: id(4), sequence: 1, latitude: -23.31, longitude: -51.21 }],
    deliveries: [{ id: id(5), stop_id: id(4), status: "em_transporte" }],
  };
  m.session.mockResolvedValue({ data: { user: { id: id(2) } }, error: null });
  m.profile.mockResolvedValue({
    data: { role: "gestor", tenant_id: id(1) },
    error: null,
  });
  m.route.mockImplementation(async () => ({ data: row, error: null }));
  m.position.mockResolvedValue({
    data: {
      latitude: -23.3,
      longitude: -51.2,
      captured_at: new Date().toISOString(),
    },
    error: null,
  });
  m.lookup.mockResolvedValue({
    geometry: {
      type: "LineString",
      coordinates: [
        [-51.2, -23.3],
        [-51.21, -23.31],
      ],
    },
    distance: 900,
    duration: 180,
  });
});
const request = (delivery?: string, token?: string) =>
  new NextRequest(
    "https://app.example/api/trajeto?rota=" +
      routeId +
      (delivery ? "&entrega=" + delivery : ""),
    token ? { headers: { Authorization: "Bearer " + token } } : undefined,
  );
describe("acesso a trajetos e previsões", () => {
  it("exige sessão e perfil antes de usar o roteamento", async () => {
    m.session.mockResolvedValue({ data: { user: null } });
    expect((await GET(request())).status).toBe(401);
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("não aceita uma rota de outra empresa mesmo se a consulta devolver o registro", async () => {
    row.tenant_id = id(99);
    expect((await GET(request())).status).toBe(404);
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("restringe o motorista à rota atribuída, inclusive após um gestor aquecer o cache", async () => {
    expect((await GET(request())).status).toBe(200);
    m.profile.mockResolvedValue({
      data: { role: "motorista", tenant_id: id(1) },
    });
    expect((await GET(request())).status).toBe(404);
    expect(m.filters).toContainEqual({
      table: "routes",
      field: "driver_id",
      value: id(2),
    });
    expect(m.lookup).toHaveBeenCalledOnce();
  });
  it("aceita o token do aplicativo apenas após validá-lo e confirmar a atribuição", async () => {
    row.driver_id = id(2);
    m.profile.mockResolvedValue({
      data: { role: "motorista", tenant_id: id(1) },
    });
    const response = await GET(request(undefined, "fixture-access-token"));
    expect(response.status).toBe(200);
    expect(m.tokens).toEqual(["fixture-access-token"]);
    expect(m.session).toHaveBeenCalledWith("fixture-access-token");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("não reutiliza cache sem sessão e não aceita coordenadas arbitrárias na URL", async () => {
    await GET(request());
    m.session.mockResolvedValue({ data: { user: null } });
    expect((await GET(request())).status).toBe(401);
    expect(m.lookup).toHaveBeenCalledOnce();
  });
  it("calcula chegada apenas para uma entrega da rota acessível", async () => {
    const response = await GET(request(id(5)));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      eta: { status: "ready", duration_seconds: 180 },
    });
    expect((await GET(request(id(99)))).status).toBe(404);
  });
  it("não faz previsão com GPS antigo e não consulta o serviço externo", async () => {
    m.position.mockResolvedValue({
      data: {
        latitude: -23.3,
        longitude: -51.2,
        captured_at: new Date(Date.now() - 3600000).toISOString(),
      },
    });
    expect(await (await GET(request(id(5)))).json()).toEqual({
      eta: { status: "stale" },
    });
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("não transforma falhas internas em detalhes expostos ao navegador", async () => {
    m.route.mockResolvedValue({
      data: null,
      error: { message: "fixture-private-database-error" },
    });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "fixture-private",
    );
  });
});
