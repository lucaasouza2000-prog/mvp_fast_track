import { test, expect, type Page, type BrowserContext } from "@playwright/test";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const manager = {
  id: id(1),
  tenant_id: id(10),
  role: "gestor",
  name: "Gestor de teste",
  phone: null,
};
const driver = {
  id: id(2),
  tenant_id: id(10),
  role: "motorista",
  name: "Motorista salvo",
  phone: "000",
};
async function setup(
  page: Page,
  context: BrowserContext,
  options: { missing?: boolean; vehicleFailure?: boolean } = {},
) {
  const user = {
    id: manager.id,
    aud: "authenticated",
    role: "authenticated",
    email: "manager@example.test",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", iat: expires - 3600, exp: expires })}.${Buffer.from("test-only-signature").toString("base64url")}`;
  await context.addCookies([
    {
      name: "sb-catalog-test-auth-token",
      value:
        "base64-" +
        encode({
          access_token: token,
          refresh_token: "test-refresh",
          expires_at: expires,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      url: "http://127.0.0.1:3101",
      sameSite: "Lax",
    },
  ]);
  await page.routeWebSocket(/catalog-test\.supabase\.co/, (socket) =>
    socket.close(),
  );
  const state = {
    drivers: options.missing ? [] : [driver],
    syncs: 0,
    creates: 0,
    payload: null as any,
    ceps: [] as string[],
  };
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.route("https://catalog-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname === "/rest/v1/profiles")
      return route.fulfill({ json: manager });
    if (url.pathname === "/rest/v1/routes") return route.fulfill({ json: [] });
    if (url.pathname === "/rest/v1/vehicles")
      return route.fulfill(
        options.vehicleFailure
          ? { status: 503, json: { message: "fixture failure" } }
          : {
              json: [
                {
                  id: id(3),
                  tenant_id: id(10),
                  plate: "TEST001",
                  description: "Teste",
                },
              ],
            },
      );
    if (url.pathname === "/rest/v1/clients")
      return route.fulfill({
        json: [{ id: id(4), tenant_id: id(10), name: "Cliente teste" }],
      });
    if (url.pathname === "/rest/v1/rpc/create_route") {
      state.payload = route.request().postDataJSON().payload;
      return route.fulfill({ json: id(50) });
    }
    return route.fulfill({
      status: 500,
      json: { message: "Unexpected test request" },
    });
  });
  await page.route("**/api/motoristas", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { drivers: state.drivers } });
    state.creates++;
    state.drivers = [driver];
    return route.fulfill({ status: 201, json: { ok: true, driver } });
  });
  await page.route("**/api/motoristas/sincronizar", (route) => {
    state.syncs++;
    state.drivers = [driver];
    return route.fulfill({ json: { drivers: state.drivers, recovered: 1 } });
  });
  await page.route("**/api/cep?**", (route) => {
    const cep = new URL(route.request().url()).searchParams.get("cep")!;
    state.ceps.push(cep);
    return route.fulfill({
      json: {
        cep,
        street: "Rua de teste",
        neighborhood: "Centro",
        city: cep === "86010000" ? "Londrina" : "Maringá",
        state: "PR",
        source: "brasilapi",
        point: {
          latitude: cep === "86010000" ? -23.31 : -23.42,
          longitude: cep === "86010000" ? -51.16 : -51.93,
        },
      },
    });
  });
  await page.goto("/gestao");
  await expect(
    page.getByRole("button", { name: "Nova rota", exact: true }),
  ).toBeEnabled();
  return state;
}
test("o motorista continua disponível se uma consulta de veículo falhar", async ({
  page,
  context,
}) => {
  await setup(page, context, { vehicleFailure: true });
  await page.getByRole("button", { name: "Nova rota", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("option", { name: "Motorista salvo", exact: true }),
  ).toHaveCount(1);
  await dialog.getByLabel("Motorista", { exact: true }).selectOption(driver.id);
  await expect(dialog.getByLabel("Motorista", { exact: true })).toHaveValue(
    driver.id,
  );
  await expect(dialog.getByRole("alert")).toContainText("veículos", {
    timeout: 15000,
  });
});
test("atualiza uma conta existente sem cadastrar outra e preserva a rota preenchida", async ({
  page,
  context,
}) => {
  const state = await setup(page, context, { missing: true });
  await page.getByRole("button", { name: "Nova rota", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("option", {
      name: "Nenhum motorista disponível",
      exact: true,
    }),
  ).toHaveCount(1);
  await dialog.locator("[name=code]").fill("ROTA-PRESERVADA");
  await dialog
    .getByRole("button", { name: "Atualizar motoristas", exact: true })
    .click();
  await expect(
    dialog.getByRole("option", { name: "Motorista salvo", exact: true }),
  ).toHaveCount(1);
  await expect(dialog.locator("[name=code]")).toHaveValue("ROTA-PRESERVADA");
  expect(state.syncs).toBe(1);
  expect(state.creates).toBe(0);
});
test("o cadastro confirmado pela API aparece ao voltar à aba Nova rota", async ({
  page,
  context,
}) => {
  const state = await setup(page, context, { missing: true });
  await page.getByRole("button", { name: "Nova rota", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Motorista", exact: true }).click();
  await dialog.getByLabel("Nome completo").fill("Motorista salvo");
  await dialog
    .getByLabel("E-mail", { exact: true })
    .fill("driver@example.test");
  await dialog.getByLabel("Telefone").fill("000");
  await dialog.getByLabel("Senha inicial").fill("STRONG-TEST-PASSWORD");
  await dialog
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText("Cadastro salvo.");
  await dialog.getByRole("button", { name: "Nova rota", exact: true }).click();
  await expect(
    dialog.getByRole("option", { name: "Motorista salvo", exact: true }),
  ).toHaveCount(1);
  expect(state.creates).toBe(1);
});
test("usa CEP e número sem campos de coordenadas e exige confirmar o ponto", async ({
  page,
  context,
}) => {
  const state = await setup(page, context);
  await page.getByRole("button", { name: "Nova rota", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("[name=code]").fill("ROTA-CEP");
  await dialog.getByLabel("Motorista", { exact: true }).selectOption(driver.id);
  await dialog.locator("[name=vehicle]").selectOption(id(3));
  await dialog.getByLabel("Cliente", { exact: true }).selectOption(id(4));
  await dialog.getByLabel("Código da carga", { exact: true }).fill("CARGA-CEP");
  await dialog
    .getByLabel("Chave NF-e ou código fiscal", { exact: true })
    .fill("NF-CEP");
  await dialog
    .getByLabel("Descrição da carga", { exact: true })
    .fill("Carga de teste");
  await dialog.getByLabel("Peso (kg)", { exact: true }).fill("100");
  const origin = dialog.getByRole("group", {
      name: "Origem da rota",
      exact: true,
    }),
    destination = dialog.getByRole("group", {
      name: "Destino da entrega 1",
      exact: true,
    });
  await origin.getByLabel("CEP", { exact: true }).fill("86010000");
  await origin.getByRole("button", { name: "Buscar CEP", exact: true }).click();
  await expect(origin.getByLabel("Rua ou avenida")).toHaveValue("Rua de teste");
  await origin.getByLabel("Número", { exact: true }).fill("100");
  await destination.getByLabel("CEP", { exact: true }).fill("87010000");
  await destination
    .getByRole("button", { name: "Buscar CEP", exact: true })
    .click();
  await destination.getByLabel("Número", { exact: true }).fill("200");
  await destination
    .getByRole("button", { name: "Confirmar endereço", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Criar rota", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("confirme o endereço");
  expect(state.payload).toBeNull();
  await origin
    .getByRole("button", { name: "Confirmar endereço", exact: true })
    .click();
  await origin.getByLabel("Número", { exact: true }).fill("101");
  await expect(origin.getByRole("status")).toHaveCount(0);
  await origin
    .getByRole("button", { name: "Confirmar endereço", exact: true })
    .click();
  await expect(dialog.getByLabel(/Latitude|Longitude/)).toHaveCount(0);
  await page.screenshot({ path: "/tmp/fasttrack-cep.png", fullPage: true });
  await dialog.getByRole("button", { name: "Criar rota", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.payload.origin).toMatchObject({
    latitude: -23.31,
    longitude: -51.16,
  });
  expect(state.payload.origin.address).toContain("101");
  expect(state.payload.deliveries[0].destination.address).toContain(
    "87010-000",
  );
  expect(state.ceps).toEqual(["86010000", "87010000"]);
});
