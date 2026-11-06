import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import type { Position, Route } from "@fasttrack/core";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
async function setup(page: Page, context: BrowserContext, failTiles = false) {
  const manager = {
    id: id(1),
    tenant_id: id(10),
    role: "gestor",
    name: "Gestor de teste",
    phone: null,
  };
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
  const token =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({
      sub: user.id,
      aud: "authenticated",
      role: "authenticated",
      iat: expires - 3600,
      exp: expires,
    }) +
    "." +
    Buffer.from("fixture-signature").toString("base64url");
  await context.addCookies([
    {
      name: "sb-catalog-test-auth-token",
      value:
        "base64-" +
        encode({
          access_token: token,
          refresh_token: "fixture-refresh",
          expires_at: expires,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      url: "http://127.0.0.1:3101",
      sameSite: "Lax",
    },
  ]);
  const route: Route = {
    id: id(20),
    code: "MAPA-TESTE",
    driver_id: id(2),
    vehicle_id: id(3),
    origin: "Origem de teste",
    origin_lat: -23.2943,
    origin_lng: -51.22093,
    destination: "Destino de teste",
    scheduled_at: null,
    status: "ativa",
    profiles: {
      id: id(2),
      tenant_id: id(10),
      role: "motorista",
      name: "Motorista de teste",
      phone: null,
    },
    vehicles: { id: id(3), plate: "TEST001", description: "Teste" },
    stops: [
      {
        id: id(21),
        route_id: id(20),
        sequence: 1,
        address: "Destino de teste",
        latitude: -23.3,
        longitude: -51.21,
      },
    ],
    deliveries: [
      {
        id: id(22),
        route_id: id(20),
        stop_id: id(21),
        client_id: id(4),
        cargo_code: "CARGA-MAPA",
        description: "Carga de teste",
        weight_kg: 100,
        volume_m3: null,
        status: "em_transporte",
        checked_in_at: new Date().toISOString(),
        checked_out_at: null,
        clients: { id: id(4), name: "Cliente mapa" },
        fiscal_documents: [
          { id: id(23), delivery_id: id(22), code: "NF-MAPA" },
        ],
      },
    ],
  };
  const point = (
    n: number,
    latitude: number,
    longitude: number,
    time: number,
  ): Position => ({
    id: id(n),
    route_id: route.id,
    driver_id: route.driver_id,
    latitude,
    longitude,
    accuracy: 5,
    captured_at: new Date(time).toISOString(),
  });
  const state = {
    route,
    positions: [
      point(30, 37.4, -122.1, Date.now() - 60000),
      point(31, -23.2943, -51.22093, Date.now() - 2000),
    ],
    positionReads: 0,
    roadReads: 0,
    failTiles,
  };
  await page.routeWebSocket(/catalog-test\.supabase\.co/, (socket) =>
    socket.close(),
  );
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAACwElEQVR4nO3TsQkAMAzAsPx/bIdC956RwQId4MVz7oOsWS+ARQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQNoHe4MqfO65yBYAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("https://tile.openstreetmap.org/**", (request) =>
    state.failTiles
      ? request.abort()
      : request.fulfill({
          contentType: "image/png",
          body: pixel,
          headers: { "Access-Control-Allow-Origin": "*" },
        }),
  );
  await page.route("https://catalog-test.supabase.co/**", async (request) => {
    const url = new URL(request.request().url());
    if (url.pathname === "/auth/v1/user")
      return request.fulfill({ json: user });
    if (url.pathname === "/rest/v1/profiles")
      return request.fulfill({ json: manager });
    if (url.pathname === "/rest/v1/routes")
      return request.fulfill({ json: [state.route] });
    if (url.pathname === "/rest/v1/positions") {
      state.positionReads++;
      return request.fulfill({
        json: [...state.positions].sort(
          (a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at),
        ),
      });
    }
    if (url.pathname === "/rest/v1/operational_events")
      return request.fulfill({
        json: [
          {
            id: id(40),
            kind: "check_in",
            captured_at: new Date().toISOString(),
          },
        ],
      });
    return request.fulfill({
      status: 500,
      json: { message: "Unexpected fixture request" },
    });
  });
  await page.route("**/api/trajeto?**", (request) => {
    if (new URL(request.request().url()).searchParams.has("entrega"))
      return request.fulfill({
        json: {
          eta: {
            status: "ready",
            arrives_at: new Date(Date.now() + 180000).toISOString(),
            captured_at: new Date().toISOString(),
            duration_seconds: 180,
          },
        },
      });
    state.roadReads++;
    return request.fulfill({
      json: {
        geometry: {
          type: "LineString",
          coordinates: [
            [-51.22093, -23.2943],
            [-51.22, -23.299],
            [-51.21, -23.3],
          ],
        },
        distance: 1100,
        duration: 180,
      },
    });
  });
  await page.goto("/gestao");
  await page.getByRole("button", { name: "Cliente mapa", exact: true }).click();
  return { state, point };
}
test("foca a última posição, exibe ruas e previsão e preserva o mapa durante novas capturas", async ({
  page,
  context,
}) => {
  const { state, point } = await setup(page, context);
  const dialog = page.getByRole("dialog");
  const marker = dialog.getByLabel("Última posição do motorista", {
    exact: true,
  });
  await expect(marker).toBeVisible({ timeout: 15000 });
  await expect(
    dialog.getByText("Trajeto planejado pelas ruas · 1.1 km.", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(/^Por volta de /)).toBeVisible();
  const frame = await dialog
    .getByLabel("Mapa da rota MAPA-TESTE", { exact: true })
    .boundingBox();
  const box = await marker.boundingBox();
  expect(
    Math.abs(box!.x + box!.width / 2 - (frame!.x + frame!.width / 2)),
  ).toBeLessThan(15);
  expect(
    Math.abs(box!.y + box!.height - (frame!.y + frame!.height / 2)),
  ).toBeLessThan(45);
  const canvas = await dialog
    .locator("canvas.maplibregl-canvas")
    .elementHandle();
  await dialog.getByRole("button", { name: "Ver rota", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Focar motorista", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  const before = state.positionReads;
  state.positions.push(point(32, -23.296, -51.216, Date.now()));
  await expect
    .poll(() => state.positionReads, { timeout: 25000 })
    .toBeGreaterThan(before);
  expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(
    dialog.getByRole("button", { name: "Focar motorista", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(state.roadReads).toBe(1);
  await dialog
    .getByRole("button", { name: "Focar motorista", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Focar motorista", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.screenshot({ path: "/tmp/fasttrack-mapa-final.png" });
});
test("oferece recuperação quando os blocos do mapa falham", async ({
  page,
  context,
}) => {
  const { state } = await setup(page, context, true);
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(
      "Algumas partes do mapa não carregaram. Tente recarregar o mapa.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 15000 });
  await expect(dialog.getByText(/^Por volta de /)).toBeVisible();
  state.failTiles = false;
  await dialog
    .getByRole("button", { name: "Recarregar mapa", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Última posição do motorista", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    dialog.getByText(
      "Algumas partes do mapa não carregaram. Tente recarregar o mapa.",
      { exact: true },
    ),
  ).toHaveCount(0);
});
