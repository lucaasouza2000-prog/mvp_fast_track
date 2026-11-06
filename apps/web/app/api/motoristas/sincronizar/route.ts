import { NextRequest, NextResponse } from "next/server";
import {
  driverDirectory,
  driverManagerContext,
} from "../../../../lib/driver-server";
import { synchronizeCompanyDrivers } from "../../../../lib/driver-directory";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  const context = await driverManagerContext();
  if (context.error) return context.error;
  try {
    return NextResponse.json(
      await synchronizeCompanyDrivers(
        driverDirectory(context.admin),
        context.tenant,
        context.actor,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 503 },
    );
  }
}
