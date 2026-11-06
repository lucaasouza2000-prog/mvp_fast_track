import {
  validCoordinate,
  normalizeRoadRoute,
  type Coordinate,
  type RoadRoute,
} from "./tracking-map";
export class RoutingError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export async function lookupRoadRoute(
  points: Coordinate[],
  request: typeof fetch = fetch,
  configuredBase = process.env.ROUTING_URL ??
    process.env.NEXT_PUBLIC_ROUTING_URL,
): Promise<RoadRoute> {
  if (
    points.length < 2 ||
    points.length > 100 ||
    !points.every(validCoordinate)
  )
    throw new RoutingError("Confira os pontos dos endereços da rota.", 422);
  const providers = configuredBase
    ? [configuredBase]
    : [
        "https://router.project-osrm.org",
        "https://routing.openstreetmap.de/routed-car",
      ];
  for (const base of providers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const url = new URL(base);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error("Invalid routing configuration");
      const response = await request(
        base.replace(/\/+$/, "") +
          "/route/v1/driving/" +
          points.map((p) => p.join(",")).join(";") +
          "?overview=full&geometries=geojson&steps=false",
        {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "User-Agent": "FastTrack/0.1 route-planning",
          },
        },
      );
      if (!response.ok) throw new Error("Routing unavailable");
      const route = normalizeRoadRoute(await response.json());
      if (route) return route;
    } catch {
      /* Try the next configured public provider, never invent geometry. */
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new RoutingError(
    "O trajeto pelas ruas está indisponível no momento. Os pontos e a posição do motorista continuam disponíveis.",
  );
}
