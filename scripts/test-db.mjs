// Executes the actual migration and RLS policies in PostgreSQL WASM, not a mock SQL parser.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
let checks = 0;
const tenant = randomUUID(),
  otherTenant = randomUUID(),
  manager = randomUUID(),
  driver = randomUUID(),
  stranger = randomUUID(),
  otherManager = randomUUID(),
  vehicle = randomUUID(),
  client = randomUUID();
await db.exec(
  `create role authenticated; create role anon; create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb not null default '{}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; create publication supabase_realtime;`,
);
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/202611050001_fasttrack.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.query("insert into tenants(id,name) values($1,$2),($3,$4)", [
  tenant,
  "Teste",
  otherTenant,
  "Outra empresa",
]);
for (const [id, t, r] of [
  [manager, tenant, "gestor"],
  [driver, tenant, "motorista"],
  [stranger, otherTenant, "motorista"],
  [otherManager, otherTenant, "gestor"],
])
  await db.query("insert into auth.users values($1,$2,$3)", [
    id,
    `${id}@test.invalid`,
    JSON.stringify({ tenant_id: t, role: r, name: r }),
  ]);
await db.query("insert into vehicles(id,tenant_id,plate) values($1,$2,$3)", [
  vehicle,
  tenant,
  "TEST001",
]);
await db.query("insert into clients(id,tenant_id,name) values($1,$2,$3)", [
  client,
  tenant,
  "Cliente teste",
]);
async function as(id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function fails(sql, params = []) {
  await assert.rejects(db.query(sql, params));
  checks++;
}
async function rpc(name, payload) {
  const r = await db.query(`select public.${name}($1) as value`, [payload]);
  return r.rows[0].value;
}
const payload = {
  code: "TEST-001",
  driver_id: driver,
  vehicle_id: vehicle,
  origin: { address: "Origem de teste", latitude: -23.31, longitude: -51.16 },
  scheduled_at: null,
  deliveries: [1, 2, 3].map((n) => ({
    client_id: client,
    destination: { address: `Destino ${n}`, latitude: -23.4, longitude: -51.9 },
    cargo_code: `CARGA-${n}`,
    description: "Apenas teste",
    weight_kg: 100,
    volume_m3: null,
    fiscal_code: `NF-${n}`,
  })),
};
await as(manager);
await fails("select create_route($1)", [{ ...payload, deliveries: [] }]);
await fails("select create_route($1)", [{ ...payload, deliveries: null }]);
await fails("select create_route($1)", [{ ...payload, driver_id: stranger }]);
const route = await rpc("create_route", payload);
checks++;
const deliveries = (
  await db.query(
    "select * from deliveries where route_id=$1 order by cargo_code",
    [route],
  )
).rows;
assert.equal(deliveries.length, 3);
checks++;
await as(stranger);
assert.equal((await db.query("select * from routes")).rows.length, 0);
assert.equal((await db.query("select * from fiscal_documents")).rows.length, 0);
assert.equal((await db.query("select * from positions")).rows.length, 0);
checks += 3;
await fails("select start_route($1)", [route]);
await fails("insert into clients(tenant_id,name) values($1,$2)", [
  tenant,
  "Invasão",
]);
await as(otherManager);
assert.equal((await db.query("select * from routes")).rows.length, 0);
checks++;
await fails("select create_route($1)", [payload]);
await as(driver);
await fails("update profiles set role='gestor' where id=$1", [driver]);
await fails("select create_route($1)", [{ ...payload, code: "INVASÃO" }]);
await fails("update deliveries set status='concluida' where id=$1", [
  deliveries[0].id,
]);
await fails("select start_route($1)", [route]);
const operation = (d, kind) => ({
  id: randomUUID(),
  route_id: route,
  delivery_id: d.id,
  kind,
  code: `NF-${deliveries.indexOf(d) + 1}`,
  captured_at: new Date().toISOString(),
});
await fails("select record_operation($1)", [
  operation(deliveries[0], "check_out"),
]);
const events = [];
for (const d of deliveries) {
  const op = operation(d, "check_in");
  events.push(op);
  await rpc("record_operation", op);
  await rpc("record_operation", op);
  checks++;
}
assert.equal(
  (await db.query("select * from operational_events")).rows.length,
  3,
);
checks++;
await fails("select record_operation($1)", [{ ...events[0], code: "OTHER" }]);
await fails("select record_operation($1)", [
  { ...operation(deliveries[0], "check_out"), code: "NF-OTHER" },
]);
await rpc("start_route", route);
checks++;
const position = {
  id: randomUUID(),
  route_id: route,
  driver_id: driver,
  latitude: -23.3,
  longitude: -51.2,
  accuracy: 5,
  captured_at: new Date().toISOString(),
};
await rpc("record_position", position);
await rpc("record_position", position);
assert.equal((await db.query("select * from positions")).rows.length, 1);
checks++;
await fails("select record_position($1)", [{ ...position, latitude: 23 }]);
await fails("select record_position($1)", [
  { ...position, id: randomUUID(), captured_at: "2000-01-01T00:00:00Z" },
]);
await fails("select record_position($1)", [
  { ...position, id: randomUUID(), latitude: 91 },
]);
await rpc("record_operation", operation(deliveries[0], "check_out"));
assert.equal(
  (await db.query("select status from routes where id=$1", [route])).rows[0]
    .status,
  "ativa",
);
assert.equal(
  (await db.query("select * from deliveries where status='concluida'")).rows
    .length,
  1,
);
checks += 2;
for (const d of deliveries.slice(1))
  await rpc("record_operation", operation(d, "check_out"));
assert.equal(
  (await db.query("select status from routes where id=$1", [route])).rows[0]
    .status,
  "concluida",
);
checks++;
await rpc("record_position", { ...position, id: randomUUID() });
checks++; // late sync of a real capture within the active interval
await fails("select record_position($1)", [
  {
    ...position,
    id: randomUUID(),
    captured_at: new Date(Date.now() + 60000).toISOString(),
  },
]);
await as(stranger);
await fails("select record_operation($1)", [events[0]]);
assert.equal(
  (await db.query("select * from operational_events")).rows.length,
  0,
);
checks++;
await db.exec("reset role; set role anon");
await fails("select * from routes");
await fails("select create_route($1)", [payload]);
console.log(
  `PASS: ${checks} verificações PostgreSQL: migration, RLS, segregação, transições, idempotência, GPS e conclusão parcial/total.`,
);
await db.close();
