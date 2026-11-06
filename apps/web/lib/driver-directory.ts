import type { Profile } from "@fasttrack/core";

export interface DriverAccount {
  id: string;
  email?: string;
  app_metadata: Record<string, unknown>;
}
export interface DriverDirectory {
  getProfile: (id: string) => Promise<Profile | null>;
  insertProfile: (profile: Profile) => Promise<void>;
  getDriver: (id: string) => Promise<{ id: string; tenant_id: string } | null>;
  insertDriver: (id: string, tenant: string) => Promise<void>;
  audit: (
    tenant: string,
    actor: string,
    id: string,
    action: string,
  ) => Promise<void>;
  accounts: (
    page: number,
    perPage: number,
  ) => Promise<{ users: DriverAccount[]; nextPage: number | null }>;
  profiles: (tenant: string) => Promise<Profile[]>;
}
export async function ensureDriverProfile(
  directory: DriverDirectory,
  account: DriverAccount,
  tenant: string,
  actor: string,
) {
  // Only admin-controlled metadata may establish ownership. Never use user_metadata
  // or an email supplied by the caller to attach an existing account to a tenant.
  if (
    account.app_metadata.tenant_id !== tenant ||
    account.app_metadata.role !== "motorista"
  )
    throw new Error(
      "A conta não possui vínculo de motorista com esta empresa.",
    );
  let profile = await directory.getProfile(account.id),
    repaired = false;
  if (profile && (profile.tenant_id !== tenant || profile.role !== "motorista"))
    throw new Error(
      "A conta já possui outro vínculo. Nenhum papel foi alterado.",
    );
  if (!profile) {
    await directory.insertProfile({
      id: account.id,
      tenant_id: tenant,
      role: "motorista",
      name:
        typeof account.app_metadata.name === "string" &&
        account.app_metadata.name.trim()
          ? account.app_metadata.name
          : (account.email ?? "Motorista"),
      phone:
        typeof account.app_metadata.phone === "string"
          ? account.app_metadata.phone
          : null,
    });
    profile = await directory.getProfile(account.id);
    repaired = true;
  }
  if (!profile || profile.tenant_id !== tenant || profile.role !== "motorista")
    throw new Error(
      "Não foi possível confirmar o perfil do motorista. Use Atualizar motoristas para conferir o vínculo.",
    );
  let driver = await directory.getDriver(account.id);
  if (driver && driver.tenant_id !== tenant)
    throw new Error(
      "O cadastro operacional possui outro vínculo. Nenhum dado foi sobrescrito.",
    );
  if (!driver) {
    await directory.insertDriver(account.id, tenant);
    driver = await directory.getDriver(account.id);
    repaired = true;
  }
  if (!driver || driver.tenant_id !== tenant)
    throw new Error(
      "Não foi possível confirmar o cadastro operacional do motorista.",
    );
  if (repaired)
    await directory.audit(
      tenant,
      actor,
      account.id,
      "driver_profile_recovered",
    );
  return { profile, repaired };
}
export async function listCompanyDrivers(
  directory: DriverDirectory,
  tenant: string,
) {
  return (await directory.profiles(tenant))
    .filter((p) => p.tenant_id === tenant && p.role === "motorista")
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
export async function synchronizeCompanyDrivers(
  directory: DriverDirectory,
  tenant: string,
  actor: string,
) {
  const candidates: DriverAccount[] = [];
  let page: number | null = 1;
  for (let attempts = 0; page !== null; attempts++) {
    if (attempts >= 50)
      throw new Error(
        "A conferência excedeu o limite desta solicitação. Peça uma revisão administrativa dos perfis.",
      );
    const result = await directory.accounts(page, 200);
    candidates.push(
      ...result.users.filter(
        (u) =>
          u.app_metadata.tenant_id === tenant &&
          u.app_metadata.role === "motorista",
      ),
    );
    if (result.nextPage !== null && result.nextPage <= page)
      throw new Error(
        "A paginação de contas não pôde ser concluída. Nenhum vínculo foi alterado.",
      );
    page = result.nextPage;
  }
  let recovered = 0;
  for (const account of candidates) {
    const result = await ensureDriverProfile(directory, account, tenant, actor);
    if (result.repaired) recovered++;
  }
  return { drivers: await listCompanyDrivers(directory, tenant), recovered };
}
