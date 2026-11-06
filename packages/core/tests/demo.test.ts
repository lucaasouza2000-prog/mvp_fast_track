import { describe, expect, it } from "vitest";
import {
  addDemoRoute,
  applyDemoOperation,
  createDemoState,
  simulateDemoPosition,
} from "../src/demo";
import type { NewRoute, Operation } from "../src";
const now = Date.parse("2026-11-05T18:00:00Z");
const event = (
  state: ReturnType<typeof createDemoState>,
  n: number,
  kind: Operation["kind"],
): Operation => {
  const route = state.routes[0],
    d = route.deliveries[n];
  return {
    id: crypto.randomUUID(),
    route_id: route.id,
    delivery_id: d.id,
    kind,
    code: d.fiscal_documents[0].code,
    captured_at: new Date(now).toISOString(),
  };
};
describe("apresentação isolada", () => {
  it("inclui três rotas e seis entregas fictícias em estados diferentes", () => {
    const s = createDemoState(now);
    expect(s.routes).toHaveLength(3);
    expect(s.routes.flatMap((r) => r.deliveries)).toHaveLength(6);
    expect(
      new Set(s.routes.flatMap((r) => r.deliveries.map((d) => d.status))).size,
    ).toBe(3);
    expect(s.drivers.every((d) => d.name.includes("exemplo"))).toBe(true);
  });
  it("mantém a conclusão parcial e finaliza somente depois da última carga", () => {
    let s = createDemoState(now);
    const original = s;
    for (let n = 0; n < 3; n++) {
      s = applyDemoOperation(s, s.drivers[0].id, event(s, n, "check_in"));
      s = applyDemoOperation(s, s.drivers[0].id, event(s, n, "check_out"));
      expect(s.routes[0].status).toBe(n === 2 ? "concluida" : "planejada");
    }
    expect(
      original.routes[0].deliveries.every((d) => d.status === "pendente"),
    ).toBe(true);
    expect(s.events.length - original.events.length).toBe(6);
  });
  it("rejeita motorista, documento e transição incorretos e aceita reenvio idempotente", () => {
    const s = createDemoState(now),
      e = event(s, 0, "check_in");
    expect(() => applyDemoOperation(s, s.drivers[1].id, e)).toThrow(
      "atribuída",
    );
    expect(() =>
      applyDemoOperation(s, s.drivers[0].id, { ...e, code: "ERRADO" }),
    ).toThrow("pertence");
    expect(() =>
      applyDemoOperation(s, s.drivers[0].id, event(s, 0, "check_out")),
    ).toThrow("check-in");
    const next = applyDemoOperation(s, s.drivers[0].id, e);
    expect(applyDemoOperation(next, s.drivers[0].id, e)).toBe(next);
    expect(() =>
      applyDemoOperation(next, s.drivers[0].id, { ...e, code: "OUTRO" }),
    ).toThrow("Identificador");
  });
  it("cadastra uma rota com os mesmos contratos e valida referências", () => {
    const s = createDemoState(now);
    const input: NewRoute = {
      code: "DEMO-NOVA",
      driver_id: s.drivers[0].id,
      vehicle_id: s.vehicles[0].id,
      origin: { address: "Origem fictícia", latitude: -23, longitude: -51 },
      scheduled_at: null,
      deliveries: [
        {
          client_id: s.clients[0].id,
          destination: {
            address: "Destino fictício",
            latitude: -24,
            longitude: -52,
          },
          cargo_code: "CARGA-NOVA",
          description: "Exemplo",
          weight_kg: 10,
          volume_m3: null,
          fiscal_code: "NF-EXEMPLO",
        },
      ],
    };
    const next = addDemoRoute(s, input);
    expect(next.routes[0].deliveries[0].status).toBe("pendente");
    expect(s.routes).toHaveLength(3);
    expect(() => addDemoRoute(next, input)).toThrow("já existe");
    expect(() =>
      addDemoRoute(s, { ...input, driver_id: crypto.randomUUID() }),
    ).toThrow("motorista");
  });
  it("simula posições somente em uma rota ativa e preserva o histórico anterior", () => {
    const s = createDemoState(now),
      r = s.routes.find((r) => r.status === "ativa")!,
      count = s.positions[r.id].length;
    const next = simulateDemoPosition(s, now);
    expect(next.positions[r.id]).toHaveLength(count + 1);
    expect(s.positions[r.id]).toHaveLength(count);
    expect(() =>
      simulateDemoPosition(
        { ...s, routes: s.routes.map((r) => ({ ...r, status: "concluida" })) },
        now,
      ),
    ).toThrow("ativa");
  });
});
