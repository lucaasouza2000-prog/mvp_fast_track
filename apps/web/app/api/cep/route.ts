import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "../../../lib/server";
import {
  lookupPostalAddress,
  normalizeCep,
  PostalLookupError,
  type PostalAddress,
} from "../../../lib/postal-address";
export const dynamic = "force-dynamic";
const cache = new Map<string, { data: PostalAddress; expires: number }>();
export async function GET(request: NextRequest) {
  const db = await serverSupabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Entre na sua conta para buscar endereços." },
      { status: 401 },
    );
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "gestor")
    return NextResponse.json(
      { error: "Busca disponível para o gestor." },
      { status: 403 },
    );
  try {
    const cep = normalizeCep(request.nextUrl.searchParams.get("cep") ?? "");
    const saved = cache.get(cep);
    if (saved && saved.expires > Date.now())
      return NextResponse.json(saved.data, {
        headers: { "Cache-Control": "private, no-store" },
      });
    const data = await lookupPostalAddress(cep);
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(cep, { data, expires: Date.now() + 86400000 });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof PostalLookupError
            ? error.message
            : "Não foi possível buscar o endereço.",
      },
      { status: error instanceof PostalLookupError ? error.status : 503 },
    );
  }
}
