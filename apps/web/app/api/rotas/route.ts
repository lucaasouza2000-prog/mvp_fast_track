import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "../../../lib/server";
import {
  archiveRoutesRequest,
  managementError,
  updateRouteRequest,
} from "../../../lib/route-management";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function change(request: NextRequest, remove: boolean) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin)
      return NextResponse.json(
        { error: "Origem inválida." },
        { status: 403, headers },
      );
    const db = await serverSupabase();
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();
    if (!user || authError)
      return NextResponse.json(
        { error: "Entre na sua conta." },
        { status: 401, headers },
      );
    const { data: profile, error } = await db
      .from("profiles")
      .select("role,tenant_id")
      .eq("id", user.id)
      .single();
    if (error || profile?.role !== "gestor" || !profile.tenant_id)
      return NextResponse.json(
        { error: "Acesso exclusivo do gestor." },
        { status: 403, headers },
      );
    const raw = await request.text();
    if (raw.length > 250000)
      return NextResponse.json(
        { error: "Dados muito extensos." },
        { status: 413, headers },
      );
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400, headers },
      );
    }
    const parsed = remove
      ? archiveRoutesRequest.safeParse(body)
      : updateRouteRequest.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: "Confira os dados e selecione as rotas novamente." },
        { status: 400, headers },
      );
    const result = remove
      ? await db.rpc("archive_routes", {
          p_routes: archiveRoutesRequest.parse(body).routes,
        })
      : await db.rpc("update_route", {
          p_route_id: body.id,
          p_version: body.version,
          payload: updateRouteRequest.parse(body).data,
        });
    if (result.error)
      return NextResponse.json(
        {
          error: managementError(result.error),
          setup: ["PGRST202", "42883"].includes(result.error.code),
        },
        { status: 409, headers },
      );
    return NextResponse.json(
      { ok: true, count: remove ? result.data : 1 },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível concluir a alteração agora." },
      { status: 503, headers },
    );
  }
}
export const PATCH = (request: NextRequest) => change(request, false);
export const DELETE = (request: NextRequest) => change(request, true);
