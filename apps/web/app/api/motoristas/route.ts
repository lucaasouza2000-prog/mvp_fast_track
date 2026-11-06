import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverSupabase } from "../../../lib/server";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  const db = await serverSupabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data: p } = await db
    .from("profiles")
    .select("tenant_id,role")
    .eq("id", user.id)
    .single();
  if (p?.role !== "gestor")
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json(
      {
        error:
          "Configure SUPABASE_SERVICE_ROLE_KEY somente no servidor para cadastrar contas.",
      },
      { status: 503 },
    );
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.email !== "string" ||
    !/^\S+@\S+\.\S+$/.test(body.email) ||
    typeof body.password !== "string" ||
    body.password.length < 12 ||
    typeof body.name !== "string" ||
    body.name.trim().length < 3 ||
    body.name.length > 120 ||
    typeof body.phone !== "string" ||
    body.phone.length > 30
  )
    return NextResponse.json(
      {
        error:
          "Informe nome, e-mail, telefone e senha inicial com pelo menos 12 caracteres.",
      },
      { status: 400 },
    );
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    app_metadata: {
      tenant_id: p.tenant_id,
      role: "motorista",
      name: body.name.trim(),
      phone: body.phone,
    },
  });
  if (error)
    return NextResponse.json(
      {
        error:
          "Não foi possível cadastrar. Verifique se o e-mail já possui conta e as regras de senha do Supabase.",
      },
      { status: 400 },
    );
  return NextResponse.json({ ok: true }, { status: 201 });
}
