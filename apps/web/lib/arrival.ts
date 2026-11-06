import {
  timestampFresh,
  type ArrivalEstimate,
  type DeliveryStatus,
} from "@fasttrack/core";
import {
  validCoordinate,
  type Coordinate,
  type RoadRoute,
  type RoutePoints,
} from "./tracking-map";
export interface ArrivalRoute extends RoutePoints {
  status: string;
  stops: {
    id: string;
    sequence: number;
    latitude: number;
    longitude: number;
  }[];
  deliveries: { id: string; stop_id: string; status: DeliveryStatus }[];
}
export async function estimateArrival(
  route: ArrivalRoute,
  deliveryId: string,
  position: { latitude: number; longitude: number; captured_at: string } | null,
  lookup: (points: Coordinate[]) => Promise<RoadRoute>,
  now: () => number = Date.now,
): Promise<ArrivalEstimate> {
  const delivery = route.deliveries.find((d) => d.id === deliveryId);
  if (!delivery) return { status: "unavailable" };
  if (delivery.status === "concluida") return { status: "completed" };
  if (
    route.status !== "ativa" ||
    delivery.status !== "em_transporte" ||
    !position
  )
    return { status: "waiting" };
  if (!timestampFresh(position.captured_at, now())) return { status: "stale" };
  const selected = route.stops.find((s) => s.id === delivery.stop_id);
  if (!selected || !validCoordinate([position.longitude, position.latitude]))
    return { status: "unavailable" };
  const stops = [...route.stops]
    .sort((a, b) => a.sequence - b.sequence)
    .filter(
      (s) =>
        s.sequence <= selected.sequence &&
        route.deliveries.some(
          (d) => d.stop_id === s.id && d.status === "em_transporte",
        ),
    );
  const points: Coordinate[] = [
    [position.longitude, position.latitude],
    ...stops.map((s): Coordinate => [s.longitude, s.latitude]),
  ];
  try {
    const road = await lookup(points);
    if (!timestampFresh(position.captured_at, now()))
      return { status: "stale" };
    return {
      status: "ready",
      arrives_at: new Date(now() + road.duration * 1000).toISOString(),
      captured_at: position.captured_at,
      duration_seconds: road.duration,
    };
  } catch {
    return { status: "unavailable" };
  }
}
