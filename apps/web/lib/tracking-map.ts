import type { Position } from "@fasttrack/core";
export type Coordinate = [number, number];
export interface RoutePoints {
  origin_lat: number;
  origin_lng: number;
  stops: { sequence: number; latitude: number; longitude: number }[];
}
export function validCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    Math.abs(value[0]) <= 180 &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    Math.abs(value[1]) <= 90
  );
}
export function routeCoordinates(route: RoutePoints): Coordinate[] {
  if (
    !Array.isArray(route.stops) ||
    !route.stops.length ||
    route.stops.length > 99
  )
    throw new Error(
      "Confira os endereços da rota antes de calcular o trajeto.",
    );
  const stops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
  const points: Coordinate[] = [
    [route.origin_lng, route.origin_lat],
    ...stops.map((s): Coordinate => [s.longitude, s.latitude]),
  ];
  if (points.some((p) => !validCoordinate(p)))
    throw new Error("Confira os pontos dos endereços da rota.");
  return points;
}
export function orderedMapPositions(positions: Position[]): Position[] {
  return positions
    .filter(
      (p) =>
        validCoordinate([p.longitude, p.latitude]) &&
        Number.isFinite(Date.parse(p.captured_at)),
    )
    .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
}
export interface RoadRoute {
  geometry: { type: "LineString"; coordinates: Coordinate[] };
  distance: number;
  duration: number;
}
export function normalizeRoadRoute(value: unknown): RoadRoute | null {
  const data = value as {
    code?: unknown;
    routes?: {
      geometry?: { type?: unknown; coordinates?: unknown };
      distance?: unknown;
      duration?: unknown;
    }[];
  } | null;
  const route = Array.isArray(data?.routes) ? data.routes[0] : undefined;
  const coordinates = route?.geometry?.coordinates;
  if (
    data?.code !== "Ok" ||
    route?.geometry?.type !== "LineString" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > 100000 ||
    !coordinates.every(validCoordinate) ||
    typeof route.distance !== "number" ||
    !Number.isFinite(route.distance) ||
    route.distance < 0 ||
    typeof route.duration !== "number" ||
    !Number.isFinite(route.duration) ||
    route.duration < 0
  )
    return null;
  return {
    geometry: { type: "LineString", coordinates },
    distance: route.distance,
    duration: route.duration,
  };
}
