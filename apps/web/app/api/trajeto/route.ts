import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "../../../lib/server";
import { lookupRoadRoute, RoutingError } from "../../../lib/routing";
import {
  routeCoordinates,
  type Coordinate,
  type RoadRoute,
} from "../../../lib/tracking-map";
import { estimateArrival, type ArrivalRoute } from "../../../lib/arrival";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const cache = new Map<string, { expires: number; data: RoadRoute }>();
const inflight = new Map<string, Promise<RoadRoute>>();
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cachedRoad(tenant: string, route: string, points: Coordinate[]) {
  const key = JSON.stringify([tenant, route, points]);
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return Promise.resolve(saved.data);
  let task = inflight.get(key);
  if (!task) {
    task = lookupRoadRoute(points)
      .then((result) => {
        if (cache.size >= 200) cache.delete(cache.keys().next().value!);
        cache.set(key, { data: result, expires: Date.now() + 600000 });
        return result;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, task);
  }
  return task;
}
export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (
      authorization &&
      (!/^Bearer [A-Za-z0-9._-]+$/i.test(authorization) ||
        authorization.length > 16000)
    )
      return NextResponse.json(
        { error: "Autenticação inválida." },
        { status: 401, headers },
      );
    const token = authorization?.slice(7);
    const db = await serverSupabase(token);
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser(token);
    if (!user || authError)
      return NextResponse.json(
        { error: "Entre na sua conta para consultar o trajeto." },
        { status: 401, headers },
      );
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("role,tenant_id")
      .eq("id", user.id)
      .single();
    if (profileError) throw new Error("Profile unavailable");
    if (!profile?.tenant_id || !["gestor", "motorista"].includes(profile.role))
      return NextResponse.json(
        { error: "Conta sem acesso ao trajeto." },
        { status: 403, headers },
      );
    const id = request.nextUrl.searchParams.get("rota") ?? "";
    const deliveryId = request.nextUrl.searchParams.get("entrega");
    if (!uuid.test(id) || (deliveryId !== null && !uuid.test(deliveryId)))
      return NextResponse.json(
        { error: "Rota ou entrega inválida." },
        { status: 400, headers },
      );
    let query = db
      .from("routes")
      .select(
        "id,tenant_id,driver_id,status,origin_lat,origin_lng,stops(id,sequence,latitude,longitude),deliveries(id,stop_id,status)",
      )
      .eq("id", id)
      .eq("tenant_id", profile.tenant_id);
    if (profile.role === "motorista") query = query.eq("driver_id", user.id);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error("Route unavailable");
    if (
      !data ||
      data.tenant_id !== profile.tenant_id ||
      (profile.role === "motorista" && data.driver_id !== user.id)
    )
      return NextResponse.json(
        { error: "Rota não encontrada." },
        { status: 404, headers },
      );
    const road = (points: Coordinate[]) =>
      cachedRoad(profile.tenant_id, id, points);
    if (deliveryId) {
      const route = data as unknown as ArrivalRoute;
      const delivery = route.deliveries.find((d) => d.id === deliveryId);
      if (!delivery)
        return NextResponse.json(
          { error: "Entrega não encontrada." },
          { status: 404, headers },
        );
      let last = null;
      if (route.status === "ativa" && delivery.status === "em_transporte") {
        const position = await db
          .from("positions")
          .select("latitude,longitude,captured_at")
          .eq("route_id", id)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (position.error)
          return NextResponse.json(
            { eta: { status: "unavailable" } },
            { headers },
          );
        last = position.data;
      }
      return NextResponse.json(
        { eta: await estimateArrival(route, deliveryId, last, road) },
        { headers },
      );
    }
    let points;
    try {
      points = routeCoordinates(data);
    } catch {
      return NextResponse.json(
        { error: "Confira os pontos dos endereços da rota." },
        { status: 422, headers },
      );
    }
    return NextResponse.json(await road(points), { headers });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof RoutingError
            ? error.message
            : "Não foi possível consultar o trajeto agora.",
      },
      { status: error instanceof RoutingError ? error.status : 503, headers },
    );
  }
}
