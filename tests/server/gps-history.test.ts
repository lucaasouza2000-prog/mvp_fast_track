import { describe, expect, it } from "vitest";
import type { Position } from "@fasttrack/core";
import {
  gpsHistorySegments,
  orderedMapPositions,
} from "../../apps/web/lib/tracking-map";
const epoch = Date.parse("2026-11-06T12:00:00Z");
const point = (
  seconds: number,
  longitude: number,
  latitude = -23.3,
  accuracy: number | null = 5,
): Position => ({
  id: String(seconds),
  route_id: "route",
  driver_id: "driver",
  longitude,
  latitude,
  accuracy,
  captured_at: new Date(epoch + seconds * 1000).toISOString(),
});
describe("histórico GPS sem ligações artificiais", () => {
  it("ordena capturas fora de ordem e mantém um deslocamento normal", () => {
    const input = [point(60, -51.201), point(0, -51.2), point(30, -51.2005)];
    expect(gpsHistorySegments(input)).toEqual([
      [
        [-51.2, -23.3],
        [-51.2005, -23.3],
        [-51.201, -23.3],
      ],
    ]);
    expect(input[0].id).toBe("60");
  });
  it("separa o salto do emulador e a volta sem excluir as capturas originais", () => {
    const input = [
      point(0, -51.2),
      point(30, -51.201),
      point(60, -122.1, 37.4),
      point(90, -51.202),
      point(120, -51.203),
    ];
    expect(gpsHistorySegments(input)).toEqual([
      [
        [-51.2, -23.3],
        [-51.201, -23.3],
      ],
      [
        [-51.202, -23.3],
        [-51.203, -23.3],
      ],
    ]);
    expect(orderedMapPositions(input)).toHaveLength(5);
  });
  it("não desenha uma travessia durante um intervalo sem captura", () => {
    expect(
      gpsHistorySegments([
        point(0, -51.2),
        point(30, -51.201),
        point(700, -51.202),
        point(730, -51.203),
      ]),
    ).toHaveLength(2);
  });
  it("interrompe o traçado ao receber uma captura imprecisa", () => {
    const input = [
      point(0, -51.2),
      point(30, -51.201),
      point(60, -51.25, -23.3, 500),
      point(90, -51.202),
      point(120, -51.203),
    ];
    expect(gpsHistorySegments(input)).toHaveLength(2);
    expect(gpsHistorySegments(input).flat()).not.toContainEqual([
      -51.25, -23.3,
    ]);
    expect(input).toHaveLength(5);
  });
  it("não transforma oscilações de um veículo parado em zigue-zague", () => {
    expect(
      gpsHistorySegments([
        point(0, -51.2, -23.3, 20),
        point(15, -51.20002, -23.30002, 20),
        point(30, -51.19999, -23.3, 20),
      ]),
    ).toEqual([]);
  });
  it("aceita ausência de precisão, remove duplicações visuais e rejeita horários simultâneos conflitantes", () => {
    expect(
      gpsHistorySegments([
        point(0, -51.2, -23.3, null),
        point(0, -51.2),
        point(30, -51.201),
      ]),
    ).toHaveLength(1);
    expect(gpsHistorySegments([point(0, -51.2), point(0, -51.21)])).toEqual([]);
  });
});
