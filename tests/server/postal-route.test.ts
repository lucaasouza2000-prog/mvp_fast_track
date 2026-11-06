import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  profile: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("../../apps/web/lib/server", () => ({
  serverSupabase: async () => ({
    auth: { getUser: mocks.session },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.profile }) }) }),
  }),
}));
vi.mock("../../apps/web/lib/postal-address", async (original) => ({
  ...(await original<typeof import("../../apps/web/lib/postal-address")>()),
  lookupPostalAddress: mocks.lookup,
}));
import { GET } from "../../apps/web/app/api/cep/route";
const request = (cep = "86010000") =>
  new NextRequest(`https://app.example/api/cep?cep=${cep}`);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ data: { user: { id: "manager" } } });
  mocks.profile.mockResolvedValue({ data: { role: "gestor" } });
  mocks.lookup.mockResolvedValue({
    cep: "86010000",
    street: "Rua Exemplo",
    neighborhood: "Centro",
    city: "Londrina",
    state: "PR",
    point: null,
    source: "viacep",
  });
});
describe("API de CEP", () => {
  it("exige autenticação e papel gestor antes de consultar o serviço", async () => {
    mocks.session.mockResolvedValue({ data: { user: null } });
    expect((await GET(request())).status).toBe(401);
    mocks.session.mockResolvedValue({ data: { user: { id: "driver" } } });
    mocks.profile.mockResolvedValue({ data: { role: "motorista" } });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("recusa CEP incompleto antes da chamada externa", async () => {
    expect((await GET(request("123"))).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("retorna informação postal sem depender de uma chave administrativa", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      city: "Londrina",
      point: null,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("não permite usar uma resposta em cache depois de perder a sessão", async () => {
    await GET(request());
    mocks.session.mockResolvedValue({ data: { user: null } });
    expect((await GET(request())).status).toBe(401);
  });
});
