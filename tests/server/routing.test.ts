import { describe, expect, it, vi } from "vitest";
import { createDemoState } from "@fasttrack/core/demo";
import {
  arrivalTime,
  deliveryDirectionsUrl,
  readArrivalEstimate,
} from "@fasttrack/core";
import {
  normalizeRoadRoute,
  orderedMapPositions,
  routeCoordinates,
  type Coordinate,
} from "../../apps/web/lib/tracking-map";
import { lookupRoadRoute } from "../../apps/web/lib/routing";
import { estimateArrival, type ArrivalRoute } from "../../apps/web/lib/arrival";
const points: Coordinate[] = [
  [-51.2, -23.3],
  [-51.21, -23.31],
];
const provider = {
  code: "Ok",
  routes: [
    {
      geometry: { type: "LineString", coordinates: points },
      distance: 950,
      duration: 180,
    },
  ],
};
const road = normalizeRoadRoute(provider)!;
const now = Date.parse("2026-11-06T14:00:00Z");
function route(): ArrivalRoute {
  return {
    status: "ativa",
    origin_lat: -23.3,
    origin_lng: -51.2,
    stops: [
      { id: "done", sequence: 1, latitude: -23.301, longitude: -51.201 },
      { id: "next", sequence: 2, latitude: -23.302, longitude: -51.202 },
      { id: "selected", sequence: 3, latitude: -23.303, longitude: -51.203 },
      { id: "later", sequence: 4, latitude: -23.304, longitude: -51.204 },
    ],
    deliveries: [
      { id: "a", stop_id: "done", status: "concluida" },
      { id: "b", stop_id: "next", status: "em_transporte" },
      { id: "c", stop_id: "selected", status: "em_transporte" },
      { id: "d", stop_id: "later", status: "em_transporte" },
    ],
  };
}
const position = {
  latitude: -23.3,
  longitude: -51.2,
  captured_at: new Date(now - 2000).toISOString(),
};
describe("trajeto e previsão", () => {
  it("ordena as paradas cadastradas sem alterar os registros originais", () => {
    const r = route();
    r.stops.reverse();
    expect(routeCoordinates(r)).toEqual([
      points[0],
      [-51.201, -23.301],
      [-51.202, -23.302],
      [-51.203, -23.303],
      [-51.204, -23.304],
    ]);
    expect(r.stops[0].id).toBe("later");
  });
  it("não descarta um destino inválido para inventar uma rota parcial", () => {
    const r = route();
    r.stops[1].longitude = 999;
    expect(() => routeCoordinates(r)).toThrow("endereços");
  });
  it("mantém pontos históricos distantes e encontra a última captura cronologicamente", () => {
    const state = createDemoState(now);
    const p = Object.values(state.positions)[0][0];
    const older = {
      ...p,
      id: "old",
      longitude: -122.1,
      latitude: 37.4,
      captured_at: new Date(now - 60000).toISOString(),
    };
    const latest = {
      ...p,
      id: "new",
      captured_at: new Date(now).toISOString(),
    };
    const list = [latest, older, { ...p, id: "invalid", longitude: 999 }];
    expect(orderedMapPositions(list).map((p) => p.id)).toEqual(["old", "new"]);
    expect(list[0].id).toBe("new");
  });
  it("aceita somente geometria rodoviária válida e duração calculada", () => {
    expect(normalizeRoadRoute(provider)).toEqual(road);
    expect(normalizeRoadRoute({ code: "NoRoute" })).toBeNull();
    expect(
      normalizeRoadRoute({
        code: "Ok",
        routes: [{ ...provider.routes[0], duration: undefined }],
      }),
    ).toBeNull();
    expect(
      normalizeRoadRoute({
        code: "Ok",
        routes: [
          {
            ...provider.routes[0],
            geometry: {
              type: "LineString",
              coordinates: [
                [999, 0],
                [1, 2],
              ],
            },
          },
        ],
      }),
    ).toBeNull();
  });
  it("usa outro serviço público se o primeiro falhar e conserva a ordem dos pontos", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json(provider));
    expect(await lookupRoadRoute(points, request, "")).toEqual(road);
    expect(String(request.mock.calls[0][0])).toContain(
      "-51.2,-23.3;-51.21,-23.31",
    );
    expect(String(request.mock.calls[1][0])).toContain(
      "routing.openstreetmap.de/routed-car",
    );
  });
  it("não envia coordenadas a um serviço diferente do configurado e não inventa linha em caso de falha", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ code: "NoRoute" }),
    );
    await expect(
      lookupRoadRoute(points, request, "https://routing.example.test"),
    ).rejects.toThrow("indisponível");
    expect(request).toHaveBeenCalledOnce();
    request.mockClear();
    await expect(
      lookupRoadRoute(points, request, "http://routing.example.test"),
    ).rejects.toThrow("indisponível");
    expect(request).not.toHaveBeenCalled();
  });
  it("calcula chegada com o tempo das vias, incluindo paradas anteriores ainda em transporte", async () => {
    const lookup = vi.fn(async () => road);
    const result = await estimateArrival(
      route(),
      "c",
      position,
      lookup,
      () => now,
    );
    expect(lookup).toHaveBeenCalledWith([
      points[0],
      [-51.202, -23.302],
      [-51.203, -23.303],
    ]);
    expect(result).toMatchObject({
      status: "ready",
      arrives_at: "2026-11-06T14:03:00.000Z",
      duration_seconds: 180,
    });
    expect(arrivalTime(result, now)).toBe("11:03");
  });
  it.each([now - 181000, now + 31000])(
    "não produz previsão com captura antiga ou relógio adiantado (%s)",
    async (time) => {
      const lookup = vi.fn(async () => road);
      expect(
        await estimateArrival(
          route(),
          "c",
          { ...position, captured_at: new Date(time).toISOString() },
          lookup,
          () => now,
        ),
      ).toEqual({ status: "stale" });
      expect(lookup).not.toHaveBeenCalled();
    },
  );
  it("não mostra previsão antes da coleta/início ou depois de concluir", async () => {
    const lookup = vi.fn(async () => road);
    const r = route();
    expect(await estimateArrival(r, "a", position, lookup, () => now)).toEqual({
      status: "completed",
    });
    r.status = "planejada";
    expect(await estimateArrival(r, "c", position, lookup, () => now)).toEqual({
      status: "waiting",
    });
    r.status = "ativa";
    r.deliveries[2].status = "pendente";
    expect(await estimateArrival(r, "c", position, lookup, () => now)).toEqual({
      status: "waiting",
    });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("rejeita a previsão se a posição ficar antiga durante a consulta", async () => {
    let clock = now;
    const lookup = async () => {
      clock = now + 181000;
      return road;
    };
    expect(
      await estimateArrival(route(), "c", position, lookup, () => clock),
    ).toEqual({ status: "stale" });
  });
  it("informa indisponibilidade do serviço sem usar tempo fictício", async () => {
    expect(
      await estimateArrival(
        route(),
        "c",
        position,
        async () => {
          throw new Error("offline");
        },
        () => now,
      ),
    ).toEqual({ status: "unavailable" });
    expect(
      readArrivalEstimate({ status: "ready", arrives_at: "tomorrow" }),
    ).toEqual({ status: "unavailable" });
  });
  it("abre navegação somente para a entrega coletada da própria rota", () => {
    const r = createDemoState(now).routes[0];
    const d = { ...r.deliveries[0], status: "em_transporte" as const };
    const url = new URL(deliveryDirectionsUrl(r, d));
    const stop = r.stops.find((s) => s.id === d.stop_id)!;
    expect(url.hostname).toBe("www.google.com");
    expect(url.searchParams.get("destination")).toBe(
      stop.latitude + "," + stop.longitude,
    );
    expect(url.searchParams.has("origin")).toBe(false);
    expect(() =>
      deliveryDirectionsUrl(r, { ...d, status: "pendente" }),
    ).toThrow("coleta");
    expect(() =>
      deliveryDirectionsUrl(r, { ...d, route_id: "another" }),
    ).toThrow("pertence");
  });
});
