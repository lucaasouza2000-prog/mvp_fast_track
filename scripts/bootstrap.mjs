import { createClient } from "@supabase/supabase-js";
const needed = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TENANT_NAME",
  "GESTOR_NAME",
  "GESTOR_EMAIL",
  "GESTOR_PASSWORD",
];
for (const key of needed)
  if (!process.env[key])
    throw new Error(`Configure ${key} no arquivo .env local.`);
if (process.env.GESTOR_PASSWORD.length < 12)
  throw new Error("Use uma senha de gestor com pelo menos 12 caracteres.");
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: tenant, error } = await admin
  .from("tenants")
  .insert({ name: process.env.TENANT_NAME })
  .select("id")
  .single();
if (error)
  throw new Error(
    "Falha ao criar a empresa. Verifique a migration e o acesso administrativo.",
  );
const { error: e } = await admin.auth.admin.createUser({
  email: process.env.GESTOR_EMAIL,
  password: process.env.GESTOR_PASSWORD,
  email_confirm: true,
  app_metadata: {
    tenant_id: tenant.id,
    role: "gestor",
    name: process.env.GESTOR_NAME,
  },
});
if (e) {
  await admin.from("tenants").delete().eq("id", tenant.id);
  throw new Error(
    "Não foi possível cadastrar o gestor. Verifique e-mail existente e política de senha.",
  );
}
console.log(
  "Empresa e gestor criados. Acesse /login com as credenciais configuradas. Nenhuma senha foi registrada nos logs.",
);
