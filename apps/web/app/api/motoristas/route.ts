import { NextRequest, NextResponse } from "next/server";
import {
  driverDirectory,
  driverManagerContext,
} from "../../../lib/driver-server";
import {
  ensureDriverProfile,
  listCompanyDrivers,
} from "../../../lib/driver-directory";
export const dynamic = "force-dynamic";
export async function GET() {
  const context = await driverManagerContext();
  if (context.error) return context.error;
  try {
    return NextResponse.json(
      {
        drivers: await listCompanyDrivers(
          driverDirectory(context.admin),
          context.tenant,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Não foi possível carregar os motoristas da sua empresa. Tente Atualizar motoristas.",
      },
      { status: 503 },
    );
  }
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  const context = await driverManagerContext();
  if (context.error) return context.error;
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.email !== "string" ||
    !/^\S+@\S+\.\S+$/.test(body.email.trim()) ||
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
  const { data, error } = await context.admin.auth.admin.createUser({
    email: body.email.trim(),
    password: body.password,
    email_confirm: true,
    app_metadata: {
      tenant_id: context.tenant,
      role: "motorista",
      name: body.name.trim(),
      phone: body.phone,
    },
  });
  if (error)
    return NextResponse.json(
      {
        error:
          "Não foi possível criar a conta. Se o e-mail já foi cadastrado, use Atualizar motoristas para conferir o vínculo, sem criar outra conta.",
      },
      { status: 400 },
    );
  if (!data.user)
    return NextResponse.json(
      {
        error:
          "O servidor não confirmou a conta. Confira a lista antes de repetir o cadastro.",
      },
      { status: 503 },
    );
  try {
    const directory = driverDirectory(context.admin);
    const { profile } = await ensureDriverProfile(
      directory,
      data.user,
      context.tenant,
      context.actor,
    );
    await directory.audit(
      context.tenant,
      context.actor,
      profile.id,
      "driver_created",
    );
    return NextResponse.json({ ok: true, driver: profile }, { status: 201 });
  } catch (error) {
    // Preserve the newly created account and its password. The scoped sync action
    // can complete a missing profile without creating another account.
    return NextResponse.json(
      {
        error: `A conta foi criada, mas o cadastro ainda precisa ser conferido. ${(error as Error).message}`,
      },
      { status: 503 },
    );
  }
}
