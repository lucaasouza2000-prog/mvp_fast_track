import { describe, expect, it } from "vitest";
import {
  ensureDriverProfile,
  listCompanyDrivers,
  synchronizeCompanyDrivers,
  type DriverAccount,
  type DriverDirectory,
} from "../../apps/web/lib/driver-directory";
import type { Profile } from "@fasttrack/core";
const tenant = "company-a",
  actor = "manager-a";
function fixture() {
  const profiles = new Map<string, Profile>(),
    drivers = new Map<string, { id: string; tenant_id: string }>(),
    audits: { tenant: string; actor: string; id: string; action: string }[] =
      [];
  const pages = new Map<
    number,
    { users: DriverAccount[]; nextPage: number | null }
  >();
  const store: DriverDirectory = {
    async getProfile(id) {
      return profiles.get(id) ?? null;
    },
    async insertProfile(p) {
      if (!profiles.has(p.id)) profiles.set(p.id, p);
    },
    async getDriver(id) {
      return drivers.get(id) ?? null;
    },
    async insertDriver(id, t) {
      if (!drivers.has(id)) drivers.set(id, { id, tenant_id: t });
    },
    async audit(t, a, id, action) {
      audits.push({ tenant: t, actor: a, id, action });
    },
    async accounts(page) {
      return pages.get(page) ?? { users: [], nextPage: null };
    },
    async profiles(t) {
      return [...profiles.values()].filter((p) => p.tenant_id === t);
    },
  };
  return { store, profiles, drivers, audits, pages };
}
const account = (id = "driver-a", company = tenant): DriverAccount => ({
  id,
  email: `${id}@example.test`,
  app_metadata: {
    tenant_id: company,
    role: "motorista",
    name: "Motorista Exemplo",
    phone: "000000000",
  },
});
describe("cadastro e atualização de motoristas", () => {
  it("completa um perfil ausente usando apenas metadados administrativos da mesma empresa", async () => {
    const f = fixture(),
      u = account();
    const r = await ensureDriverProfile(f.store, u, tenant, actor);
    expect(r.profile).toMatchObject({
      id: u.id,
      tenant_id: tenant,
      role: "motorista",
    });
    expect(f.drivers.get(u.id)?.tenant_id).toBe(tenant);
    expect(r.repaired).toBe(true);
    expect(f.audits).toEqual([
      { tenant, actor, id: u.id, action: "driver_profile_recovered" },
    ]);
  });
  it("não duplica os registros nem a auditoria em uma atualização repetida", async () => {
    const f = fixture(),
      u = account();
    await ensureDriverProfile(f.store, u, tenant, actor);
    const r = await ensureDriverProfile(f.store, u, tenant, actor);
    expect(r.repaired).toBe(false);
    expect(f.profiles.size).toBe(1);
    expect(f.drivers.size).toBe(1);
    expect(f.audits).toHaveLength(1);
  });
  it("não retorna sucesso se a gravação não puder ser confirmada", async () => {
    const f = fixture();
    f.store.insertProfile = async () => {};
    await expect(
      ensureDriverProfile(f.store, account(), tenant, actor),
    ).rejects.toThrow("confirmar o perfil");
    expect(f.drivers.size).toBe(0);
  });
  it("não troca a empresa ou o papel de uma conta existente", async () => {
    const f = fixture(),
      u = account();
    f.profiles.set(u.id, {
      id: u.id,
      tenant_id: tenant,
      role: "gestor",
      name: "Gestor",
      phone: null,
    });
    await expect(
      ensureDriverProfile(f.store, u, tenant, actor),
    ).rejects.toThrow("outro vínculo");
    expect(f.profiles.get(u.id)?.role).toBe("gestor");
    expect(f.audits).toHaveLength(0);
    f.profiles.set(u.id, {
      id: u.id,
      tenant_id: "company-b",
      role: "motorista",
      name: "Outra empresa",
      phone: null,
    });
    await expect(
      ensureDriverProfile(f.store, u, tenant, actor),
    ).rejects.toThrow("outro vínculo");
    expect(f.profiles.get(u.id)?.tenant_id).toBe("company-b");
  });
  it("recusa conta sem vínculo administrativo e não confia em user_metadata", async () => {
    const f = fixture();
    const u = {
      id: "unbound",
      app_metadata: {},
      user_metadata: { tenant_id: tenant, role: "motorista" },
    };
    await expect(
      ensureDriverProfile(f.store, u, tenant, actor),
    ).rejects.toThrow("não possui vínculo");
    expect(f.profiles.size).toBe(0);
  });
  it("confere todas as páginas e recupera somente motoristas pertencentes à empresa", async () => {
    const f = fixture();
    f.pages.set(1, {
      users: [account("own"), account("foreign", "company-b")],
      nextPage: 2,
    });
    f.pages.set(2, {
      users: [
        { id: "manager", app_metadata: { tenant_id: tenant, role: "gestor" } },
        account("own-two"),
      ],
      nextPage: null,
    });
    const result = await synchronizeCompanyDrivers(f.store, tenant, actor);
    expect(result.recovered).toBe(2);
    expect(result.drivers.map((d) => d.id).sort()).toEqual(["own", "own-two"]);
    expect(f.profiles.has("foreign")).toBe(false);
    expect(f.profiles.has("manager")).toBe(false);
    expect(
      (await synchronizeCompanyDrivers(f.store, tenant, actor)).recovered,
    ).toBe(0);
  });
  it("não lista perfis de outra empresa nem gestores mesmo se o adaptador retornar dados extras", async () => {
    const f = fixture();
    f.store.profiles = async () => [
      {
        id: "own",
        tenant_id: tenant,
        role: "motorista",
        name: "Local",
        phone: null,
      },
      {
        id: "foreign",
        tenant_id: "company-b",
        role: "motorista",
        name: "Outro",
        phone: null,
      },
      {
        id: "manager",
        tenant_id: tenant,
        role: "gestor",
        name: "Gestor",
        phone: null,
      },
    ];
    expect(
      (await listCompanyDrivers(f.store, tenant)).map((d) => d.id),
    ).toEqual(["own"]);
  });
  it("interrompe paginação inválida antes de alterar os perfis", async () => {
    const f = fixture();
    f.pages.set(1, { users: [account()], nextPage: 1 });
    await expect(
      synchronizeCompanyDrivers(f.store, tenant, actor),
    ).rejects.toThrow("paginação");
    expect(f.profiles.size).toBe(0);
  });
});
