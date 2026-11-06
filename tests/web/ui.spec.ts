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
