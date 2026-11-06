import { describe, expect, it } from "vitest";
import {
  backoff,
  drainQueue,
  nfeDigit,
  normalizeFiscalCode,
  overlayPendingOperations,
  positionFresh,
  validateOperation,
  newRouteSchema,
  type Delivery,
  type QueueItem,
  type Route,
} from "../src";
const base = "3526111234567800012355001000000001100000000";
const key = base + nfeDigit(base);
const document = { id: "doc", delivery_id: "delivery", code: key };
const delivery = {
  status: "pendente",
  fiscal_documents: [document],
} as Delivery;
const item = (id: string): QueueItem => ({
  id,
  kind: "operation",
  payload: {
    id,
    delivery_id: "delivery",
    route_id: "route",
    kind: "check_in",
    code: key,
    captured_at: new Date().toISOString(),
  },
  attempts: 0,
  nextAttemptAt: 0,
});
describe("documentos fiscais", () => {
  it("valida os 44 dígitos e extrai uma chave de URL sem acessá-la", () => {
    expect(key).toHaveLength(44);
    expect(
      normalizeFiscalCode(`https://nfe.example/consulta?p=${key}|2|1`),
    ).toBe(key);
    expect(normalizeFiscalCode(key.match(/.{1,4}/g)!.join(" "))).toBe(key);
  });
  it("rejeita DV inválido, URL sem chave e entrada excessiva", () => {
    expect(() =>
      normalizeFiscalCode(key.slice(0, 43) + ((Number(key[43]) + 1) % 10)),
    ).toThrow("verificador");
    expect(() => normalizeFiscalCode("https://example.com/123")).toThrow();
    expect(() => normalizeFiscalCode("x".repeat(5000))).toThrow();
    expect(() => normalizeFiscalCode("1".repeat(45))).toThrow();
  });
  it("preserva códigos fiscais cadastrados sem presumir unicidade global", () => {
    expect(normalizeFiscalCode(" nf-123 ")).toBe("NF-123");
    expect(normalizeFiscalCode("000123")).toBe("000123");
    expect(() => validateOperation(delivery, "check_in", "000123")).toThrow(
      "pertence",
    );
  });
  it("exige a carga e a transição corretas", () => {
    expect(validateOperation(delivery, "check_in", key)).toBe(key);
    expect(() => validateOperation(delivery, "check_out", key)).toThrow(
      "check-in",
    );
    expect(() =>
      validateOperation({ ...delivery, status: "concluida" }, "check_in", key),
    ).toThrow();
    expect(
      validateOperation(
        { ...delivery, status: "em_transporte" },
        "check_out",
        key,
      ),
    ).toBe(key);
  });
  it("não aceita rota sem entregas", () => {
    expect(newRouteSchema.safeParse({ deliveries: [] }).success).toBe(false);
  });
});
describe("fila offline", () => {
  it("confirma remoção somente depois da resposta do servidor", async () => {
    const actions: string[] = [];
    await drainQueue(
      [item("a"), item("b")],
      async (x) => {
        actions.push(`send:${x.id}`);
      },
      async (id) => {
        actions.push(`ack:${id}`);
      },
      async () => {},
      100,
    );
    expect(actions).toEqual(["send:a", "ack:a", "send:b", "ack:b"]);
  });
  it("preserva falhas e bloqueia a ordem check-in/check-out com backoff", async () => {
    const sent: string[] = [],
      acks: string[] = [],
      retries: QueueItem[] = [];
    await drainQueue(
      [item("a"), item("b")],
      async (x) => {
        sent.push(x.id);
        throw new Error("offline");
      },
      async (id) => {
        acks.push(id);
      },
      async (x) => {
        retries.push(x);
      },
      100,
    );
    expect(sent).toEqual(["a"]);
    expect(acks).toEqual([]);
    expect(retries[0].attempts).toBe(1);
    expect(retries[0].nextAttemptAt).toBeGreaterThan(100);
  });
  it("não ultrapassa o primeiro item aguardando retentativa", async () => {
    const sent: string[] = [];
    await drainQueue(
      [{ ...item("a"), nextAttemptAt: 9999 }, item("b")],
      async (x) => {
        sent.push(x.id);
      },
      async () => {},
      async () => {},
      100,
    );
    expect(sent).toEqual([]);
  });
  it("limita o backoff e projeta operações sem apagar o estado confirmado", () => {
    expect(backoff(0, 0)).toBe(1000);
    expect(backoff(30, 0)).toBe(300000);
    const rs = [
      {
        id: "route",
        status: "ativa",
        deliveries: [{ ...delivery, id: "delivery" }],
      },
    ] as Route[];
    const a = item("a"),
      b = item("b");
    b.payload = { ...b.payload, kind: "check_out" } as typeof a.payload;
    const optimistic = overlayPendingOperations(rs, [a, b]);
    expect(optimistic[0].deliveries[0].status).toBe("concluida");
    expect(optimistic[0].status).toBe("concluida");
    expect(rs[0].deliveries[0].status).toBe("pendente");
    expect(
      overlayPendingOperations(optimistic, [a])[0].deliveries[0].status,
    ).toBe("concluida");
  });
  it("não trata localização antiga como recente", () => {
    const now = Date.now();
    expect(positionFresh(undefined, now)).toBe(false);
    expect(
      positionFresh(
        { captured_at: new Date(now - 200000).toISOString() } as never,
        now,
      ),
    ).toBe(false);
    expect(
      positionFresh(
        { captured_at: new Date(now - 1000).toISOString() } as never,
        now,
      ),
    ).toBe(true);
  });
});
