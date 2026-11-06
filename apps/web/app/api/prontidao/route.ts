import "server-only";
import { assessBackend, type ReadinessReport } from "../../../lib/readiness";
export const dynamic = "force-dynamic";
let cached: { report: ReadinessReport; expires: number } | null = null;
let pending: Promise<ReadinessReport> | null = null;
export async function GET() {
  if (cached && cached.expires > Date.now())
    return Response.json(cached.report, {
      headers: { "Cache-Control": "no-store" },
    });
  pending ??= assessBackend({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publicKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    secretKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  try {
    const report = await pending;
    cached = { report, expires: Date.now() + 30000 };
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } finally {
    pending = null;
  }
}
