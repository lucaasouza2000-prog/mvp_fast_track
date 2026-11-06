import { readArrivalEstimate, type ArrivalEstimate } from "@fasttrack/core";
import { backend } from "./backend";
export async function deliveryForecast(
  route: string,
  delivery: string,
): Promise<ArrivalEstimate> {
  let session;
  try {
    session = (await backend.auth.getSession()).data.session;
  } catch {
    return { status: "unavailable" };
  }
  if (!session) return { status: "unavailable" };
  const base =
    process.env.EXPO_PUBLIC_WEB_URL || "https://mvpfasttrack.vercel.app";
  if (!base.startsWith("https://")) return { status: "unavailable" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(
      base.replace(/\/+$/, "") +
        "/api/trajeto?rota=" +
        encodeURIComponent(route) +
        "&entrega=" +
        encodeURIComponent(delivery),
      {
        signal: controller.signal,
        headers: { Authorization: "Bearer " + session.access_token },
      },
    );
    if (!response.ok) return { status: "unavailable" };
    return readArrivalEstimate((await response.json()).eta);
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
