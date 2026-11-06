import { test, expect } from "@playwright/test";
test("gestão sem backend informa a configuração e não inventa entregas", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/gestao");
  await expect(
    page.getByRole("heading", { name: "Acompanhe suas entregas." }),
  ).toBeVisible();
  await expect(
    page.getByText("Conecte sua operação ao Supabase"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tudo pronto para a primeira rota" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nova rota", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Pesquisar entregas" })
    .fill("cliente inexistente");
  await expect(
    page.getByRole("heading", { name: "Nenhuma entrega encontrada" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/fasttrack-gestao.png", fullPage: true });
});
test("login e motorista apresentam limites reais sem backend", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Entrar na plataforma" }),
  ).toBeDisabled();
  await expect(
    page.getByText("O backend ainda não foi configurado.", { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/fasttrack-login.png", fullPage: true });
  await page.goto("/motorista");
  await expect(
    page.getByText("Na estrada, use o aplicativo Android"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nenhuma rota atribuída" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/fasttrack-motorista.png",
    fullPage: true,
  });
});

test("a prévia permite alternar as três interfaces sem consultar o Supabase", async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(".supabase.co")) requests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/interfaces");
  await expect(
    page.getByRole("heading", { name: "Acompanhe suas entregas." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nova rota", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Motorista", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Suas rotas." }),
  ).toBeVisible();
  await expect(page.getByText("Prévia visual", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Vamos começar?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Entrar na plataforma" }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Gestão", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/fasttrack-interfaces.png",
    fullPage: true,
  });
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("a demonstração tem cargas fictícias e persiste check-in/check-out sem backend", async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(".supabase.co") || r.url().includes("/api/motoristas"))
      requests.push(r.url());
  });
  await page.goto("/demonstracao");
  await expect(
    page.getByText(
      "Dados fictícios. Operações salvas somente neste navegador. GPS e trajetos simulados.",
    ),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await page.getByRole("button", { name: "Motorista", exact: true }).click();
  const route = page.locator(".route-card").filter({ hasText: "DEMO-PR-001" });
  await route.getByRole("button", { name: "Ver rota", exact: true }).click();
  const cargo = route
    .locator(".driver-delivery")
    .filter({ hasText: "DEMO-001" });
  await cargo.getByRole("button", { name: "Check-in", exact: true }).click();
  await context.setOffline(true);
  await page
    .getByRole("textbox", { name: "Código fiscal ou chave NF-e" })
    .fill("ERRADO");
  await page
    .getByRole("button", { name: "Confirmar registro", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Documento não pertence",
  );
  await page
    .getByRole("textbox", { name: "Código fiscal ou chave NF-e" })
    .fill("NF-DEMO-001");
  await page
    .getByRole("button", { name: "Confirmar registro", exact: true })
    .click();
  await expect(cargo.getByText("Em transporte", { exact: true })).toBeVisible();
  await cargo.getByRole("button", { name: "Check-out", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Código fiscal ou chave NF-e" })
    .fill("NF-DEMO-001");
  await page
    .getByRole("button", { name: "Confirmar registro", exact: true })
    .click();
  await expect(cargo.getByText("Concluída", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await page
    .getByRole("textbox", { name: "Pesquisar entregas" })
    .fill("DEMO-001");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.locator("tbody tr").getByText("Concluída", { exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([]);
});

test("a demonstração permite cadastrar motorista e rota e restaurar o cenário", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(".supabase.co") || r.url().includes("/api/motoristas"))
      requests.push(r.url());
  });
  await page.goto("/demonstracao");
  await page.getByRole("button", { name: "Nova rota", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Motorista", exact: true }).click();
  await dialog
    .getByLabel("Nome completo", { exact: true })
    .fill("João Apresentação");
  await dialog.getByLabel("E-mail", { exact: true }).fill("joao@example.test");
  await dialog.getByLabel("Telefone", { exact: true }).fill("(00) 00000-0000");
  await expect(
    dialog.getByLabel("Senha inicial", { exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText("Cadastro salvo.");
  await dialog.getByRole("button", { name: "Nova rota", exact: true }).click();
  await dialog.locator("[name=code]").fill("DEMO-NOVA");
  await dialog
    .locator("[name=driver]")
    .selectOption({ label: "João Apresentação" });
  await dialog.locator("[name=vehicle]").selectOption({ index: 1 });
  await dialog.locator("[name=origin]").fill("Londrina · origem fictícia");
  await dialog.locator("[name=origin_lat]").fill("-23.31");
  await dialog.locator("[name=origin_lng]").fill("-51.16");
  await dialog
    .getByLabel("Cliente", { exact: true })
    .selectOption({ index: 1 });
  await dialog
    .getByLabel("Código da carga", { exact: true })
    .fill("DEMO-NOVA-CARGA");
  await dialog
    .getByLabel("Destino · endereço", { exact: true })
    .fill("Maringá · destino fictício");
  await dialog.getByLabel("Latitude", { exact: true }).fill("-23.42");
  await dialog.getByLabel("Longitude", { exact: true }).fill("-51.93");
  await dialog
    .getByLabel("Chave NF-e ou código fiscal", { exact: true })
    .fill("NF-DEMO-NOVA");
  await dialog
    .getByLabel("Descrição da carga", { exact: true })
    .fill("Equipamento fictício");
  await dialog.getByLabel("Peso (kg)", { exact: true }).fill("100");
  await dialog.getByRole("button", { name: "Criar rota", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody tr")).toHaveCount(7);
  await page.getByRole("button", { name: "Motorista", exact: true }).click();
  await page
    .getByLabel("Motorista do exemplo")
    .selectOption({ label: "João Apresentação" });
  await expect(page.locator(".route-card")).toHaveCount(1);
  await expect(page.locator(".route-card")).toContainText("DEMO-NOVA");
  await page.getByRole("button", { name: "Reiniciar demonstração" }).click();
  await page.getByRole("button", { name: "Gestão", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  expect(requests).toEqual([]);
});

test("detalhes da demonstração identificam posições simuladas e não acessam o Supabase", async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(".supabase.co")) requests.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.goto("/demonstracao");
  await page.getByRole("button", { name: "Simular posição GPS" }).click();
  await expect(page.getByRole("status")).toContainText("posição fictícia");
  await page
    .getByRole("button", { name: "Indústria Aurora · exemplo", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("Posição fictícia de demonstração", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Todas as posições e horários deste exemplo são fictícios.",
      { exact: false },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.screenshot({
    path: "/tmp/fasttrack-demonstracao-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/fasttrack-demonstracao-mobile.png",
    fullPage: true,
  });
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("a configuração mostra pendências e gera SQL sem solicitar senha", async ({
  page,
}) => {
  await page.route("**/api/prontidao", (r) =>
    r.fulfill({
      json: {
        checkedAt: new Date().toISOString(),
        backendReady: false,
        checks: [
          {
            id: "tables",
            title: "Tabelas do FastTrack",
            state: "pending",
            message: "Aplique a migration no SQL Editor do Supabase.",
          },
        ],
      },
    }),
  );
  await page.goto("/configuracao");
  await expect(
    page.getByText("Aplique a migration no SQL Editor do Supabase.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Nome do gestor", { exact: true })
    .fill("Gestor D'Ávila");
  await page
    .getByLabel("E-mail criado no Supabase", { exact: true })
    .fill("gestor@example.test");
  await page.getByRole("button", { name: "Gerar SQL de vinculação" }).click();
  await expect(
    page.getByRole("textbox", { name: "SQL de vinculação do gestor" }),
  ).toHaveValue(/Gestor D''Ávila/);
  await expect(page.locator("input[type=password]")).toHaveCount(0);
});
