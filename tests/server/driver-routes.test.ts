import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  directory: vi.fn(),
  ensure: vi.fn(),
  list: vi.fn(),
  synchronize: vi.fn(),
}));
vi.mock("../../apps/web/lib/driver-server", () => ({
  driverManagerContext: mocks.context,
  driverDirectory: mocks.directory,
}));
vi.mock("../../apps/web/lib/driver-directory", () => ({
  ensureDriverProfile: mocks.ensure,
  listCompanyDrivers: mocks.list,
  synchronizeCompanyDrivers: mocks.synchronize,
}));
import { GET, POST } from "../../apps/web/app/api/motoristas/route";
import { POST as SYNC } from "../../apps/web/app/api/motoristas/sincronizar/route";
const driver = {
  id: "driver-a",
  tenant_id: "tenant-a",
  role: "motorista",
  name: "Motorista",
  phone: "000",
};
const store = { audit: vi.fn() };
const admin = { auth: { admin: { createUser: vi.fn() } } };
function request(
  body: unknown = {
    name: "Motorista Exemplo",
    email: "driver@example.test",
    phone: "000",
    password: "ONLY-TEST-STRONG-PASSWORD",
  },
) {
  return new NextRequest("https://app.example/api/motoristas", {
    method: "POST",
    headers: {
      origin: "https://app.example",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({
    admin,
    tenant: "tenant-a",
    actor: "manager-a",
  });
  mocks.directory.mockReturnValue(store);
  mocks.list.mockResolvedValue([driver]);
  mocks.ensure.mockResolvedValue({ profile: driver, repaired: false });
  mocks.synchronize.mockResolvedValue({ drivers: [driver], recovered: 0 });
  admin.auth.admin.createUser.mockResolvedValue({
    data: {
      user: {
        id: driver.id,
        app_metadata: { tenant_id: "tenant-a", role: "motorista" },
      },
    },
    error: null,
  });
});
describe("API de motoristas", () => {
  it("exige sessão/gestor para listar e sincronizar", async () => {
    mocks.context.mockResolvedValue({
      error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    });
    expect((await GET()).status).toBe(401);
    expect((await SYNC(request())).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.synchronize).not.toHaveBeenCalled();
  });
  it("rejeita POST de outra origem sem criar conta", async () => {
    const req = new NextRequest("https://app.example/api/motoristas", {
      method: "POST",
      headers: { origin: "https://other.example" },
    });
    expect((await POST(req)).status).toBe(403);
    expect((await SYNC(req)).status).toBe(403);
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it("retorna somente o perfil confirmado, sem senha ou metadados de autenticação", async () => {
    const r = await POST(request());
    expect(r.status).toBe(201);
    const data = await r.json();
    expect(data).toEqual({ ok: true, driver });
    expect(JSON.stringify(data)).not.toContain("PASSWORD");
    expect(mocks.ensure).toHaveBeenCalledWith(
      store,
      expect.objectContaining({ id: driver.id }),
      "tenant-a",
      "manager-a",
    );
    expect(store.audit).toHaveBeenCalledWith(
      "tenant-a",
      "manager-a",
      driver.id,
      "driver_created",
    );
  });
  it("não comunica Cadastro salvo se o perfil não foi confirmado", async () => {
    mocks.ensure.mockRejectedValue(new Error("Perfil ausente"));
    const r = await POST(request());
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain(
      "cadastro ainda precisa ser conferido",
    );
  });
  it("conserva o escopo do gestor e ignora empresa/papel recebidos no corpo", async () => {
    const r = await POST(
      request({
        name: "Motorista Exemplo",
        email: "driver@example.test",
        phone: "000",
        password: "ONLY-TEST-STRONG-PASSWORD",
        tenant_id: "other",
        role: "gestor",
      }),
    );
    expect(r.status).toBe(201);
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        app_metadata: expect.objectContaining({
          tenant_id: "tenant-a",
          role: "motorista",
        }),
      }),
    );
  });
  it("sincroniza apenas o escopo definido pela sessão e não usa a empresa do cliente", async () => {
    const r = await SYNC(request({ tenant_id: "other" }));
    expect(r.status).toBe(200);
    expect(mocks.synchronize).toHaveBeenCalledWith(
      store,
      "tenant-a",
      "manager-a",
    );
  });
  it("lista sem cache compartilhado entre gestores", async () => {
    const r = await GET();
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.list).toHaveBeenCalledWith(store, "tenant-a");
  });
});
