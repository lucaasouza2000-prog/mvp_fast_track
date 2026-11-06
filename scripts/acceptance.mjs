// Creates permanent, clearly labeled fixtures ONLY in a dedicated test project.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
if (process.env.ALLOW_TEST_DATA !== "1")
  throw new Error("Use apenas em homologação e configure ALLOW_TEST_DATA=1.");
for (const name of [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GESTOR_PASSWORD",
  "TEST_DRIVER_EMAIL",
  "TEST_DRIVER_PASSWORD",
])
  if (!process.env[name]) throw new Error(`Variável ausente: ${name}`);
const options = { auth: { persistSession: false, autoRefreshToken: false } },
  url = process.env.SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options),
  manager = createClient(url, process.env.SUPABASE_ANON_KEY, options),
  driver = createClient(url, process.env.SUPABASE_ANON_KEY, options);
function ok(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
const suffix = Date.now(),
  tenant = ok(
    await admin
      .from("tenants")
      .insert({ name: `HOMOLOGAÇÃO FastTrack ${suffix}` })
      .select()
      .single(),
  );
const managerEmail = `gestor-${suffix}@fasttrack.test`;
const managerUser = ok(
  await admin.auth.admin.createUser({
    email: managerEmail,
    password: process.env.GESTOR_PASSWORD,
    email_confirm: true,
    app_metadata: {
      tenant_id: tenant.id,
      role: "gestor",
      name: "Gestor de homologação",
    },
  }),
).user;
const driverUser = ok(
  await admin.auth.admin.createUser({
    email: process.env.TEST_DRIVER_EMAIL,
    password: process.env.TEST_DRIVER_PASSWORD,
    email_confirm: true,
    app_metadata: {
      tenant_id: tenant.id,
      role: "motorista",
      name: "Motorista de homologação",
      phone: "00000000000",
    },
  }),
).user;
ok(
  await manager.auth.signInWithPassword({
    email: managerEmail,
    password: process.env.GESTOR_PASSWORD,
  }),
);
ok(
  await driver.auth.signInWithPassword({
    email: process.env.TEST_DRIVER_EMAIL,
    password: process.env.TEST_DRIVER_PASSWORD,
  }),
);
const client = ok(
    await manager
      .from("clients")
      .insert({ tenant_id: tenant.id, name: "Cliente FICTÍCIO de homologação" })
      .select()
      .single(),
  ),
  vehicle = ok(
    await manager
      .from("vehicles")
      .insert({
        tenant_id: tenant.id,
        plate: `T${String(suffix).slice(-6)}`,
        description: "Veículo FICTÍCIO",
      })
      .select()
      .single(),
  );
const route = ok(
  await manager.rpc("create_route", {
    payload: {
      code: `HOMOLOG-${suffix}`,
      driver_id: driverUser.id,
      vehicle_id: vehicle.id,
      origin: {
        address: "Origem FICTÍCIA · Londrina",
        latitude: -23.31,
        longitude: -51.16,
      },
      scheduled_at: null,
      deliveries: [1, 2, 3].map((n) => ({
        client_id: client.id,
        destination: {
          address: `Destino FICTÍCIO ${n} · Maringá`,
          latitude: -23.42,
          longitude: -51.93,
        },
        cargo_code: `TEST-${n}`,
        description: "Carga FICTÍCIA para testes",
        weight_kg: 10,
        volume_m3: null,
        fiscal_code: `NF-TEST-${n}`,
      })),
    },
  }),
);
const ds = ok(
  await driver
    .from("deliveries")
    .select("*")
    .eq("route_id", route)
    .order("cargo_code"),
);
assert.equal(ds.length, 3);
for (const [i, d] of ds.entries()) {
  const p_event = {
    id: randomUUID(),
    route_id: route,
    delivery_id: d.id,
    kind: "check_in",
    code: `NF-TEST-${i + 1}`,
    captured_at: new Date().toISOString(),
  };
  ok(await driver.rpc("record_operation", { p_event }));
  ok(await driver.rpc("record_operation", { p_event }));
}
ok(await driver.rpc("start_route", { p_route_id: route }));
for (const [i, d] of ds.entries()) {
  ok(
    await driver.rpc("record_operation", {
      p_event: {
        id: randomUUID(),
        route_id: route,
        delivery_id: d.id,
        kind: "check_out",
        code: `NF-TEST-${i + 1}`,
        captured_at: new Date().toISOString(),
      },
    }),
  );
  const status = ok(
    await manager.from("routes").select("status").eq("id", route).single(),
  );
  assert.equal(status.status, i === 2 ? "concluida" : "ativa");
}
const events = ok(
  await manager.from("operational_events").select("id").eq("route_id", route),
);
assert.equal(events.length, 6);
console.log(
  `PASS Supabase Auth + REST + RPC: rota ${route}, três entregas e seis eventos. Fixtures preservadas no projeto de homologação. Gestor de teste: ${managerUser.id}. GPS, câmera e offline físico NÃO foram testados por este script.`,
);
