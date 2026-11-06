import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { managerBootstrapSql } from "../src/bootstrap-manager";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(
    "create role authenticated; create role anon; create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb not null default '{}',email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; create publication supabase_realtime;",
  );
  await db.exec(
    await readFile(
      new URL(
        "../../../supabase/migrations/202611050001_fasttrack.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("vinculação administrativa do primeiro gestor", () => {
  it("exige uma conta confirmada antes de criar a empresa", async () => {
    await expect(
      db.exec(managerBootstrapSql("absent@example.test", "Gestor Teste")),
    ).rejects.toThrow("Primeiro crie");
    expect((await db.query("select * from tenants")).rows).toHaveLength(0);
  });
  it("cria perfil, registra auditoria e pode ser repetida sem duplicar", async () => {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      ["00000000-0000-4000-8000-000000000001", "manager@example.test"],
    );
    const sql = managerBootstrapSql("MANAGER@example.test", "Gestor Teste");
    await db.exec(sql);
    await db.exec(sql);
    expect((await db.query("select role from profiles")).rows).toEqual([
      { role: "gestor" },
    ]);
    expect((await db.query("select * from tenants")).rows).toHaveLength(1);
    expect((await db.query("select * from audit_log")).rows).toHaveLength(1);
  });
  it("não permite execução por um usuário comum", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(
        db.exec(managerBootstrapSql("manager@example.test", "Tentativa")),
      ).rejects.toThrow("apenas no SQL Editor");
    } finally {
      await db.exec("reset role");
    }
  });
  it("não promove automaticamente uma conta que já é motorista", async () => {
    const t = (await db.query("select id from tenants")).rows[0].id;
    await db.query(
      "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,$2,$3,now())",
      [
        "00000000-0000-4000-8000-000000000002",
        "driver@example.test",
        JSON.stringify({ tenant_id: t, role: "motorista", name: "Motorista" }),
      ],
    );
    await expect(
      db.exec(managerBootstrapSql("driver@example.test", "Tentativa")),
    ).rejects.toThrow("outro papel");
  });
  it("protege os delimitadores do bloco SQL contra conteúdo do formulário", async () => {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      ["00000000-0000-4000-8000-000000000003", "boundary@example.test"],
    );
    const maliciousName = "Gestor $fasttrack$ com D'Ávila";
    const sql = managerBootstrapSql("boundary@example.test", maliciousName);
    expect(sql).toContain("DO $fasttrack_1$");
    await db.exec(sql);
    expect(
      (
        await db.query("select name from profiles where id=$1", [
          "00000000-0000-4000-8000-000000000003",
        ])
      ).rows,
    ).toEqual([{ name: maliciousName }]);
  });
  it("escapa apóstrofos e rejeita campos inválidos", () => {
    expect(
      managerBootstrapSql("manager@example.test", "D'Ávila Gestor"),
    ).toContain("D''Ávila");
    expect(() => managerBootstrapSql("invalido", "Gestor")).toThrow();
  });
});
