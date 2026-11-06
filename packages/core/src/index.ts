import { z } from "zod";

export type Role = "gestor" | "motorista";
export type DeliveryStatus = "pendente" | "em_transporte" | "concluida";
export type RouteStatus = "planejada" | "ativa" | "concluida";
export interface Profile {
  id: string;
  tenant_id: string;
  name: string;
  role: Role;
  phone: string | null;
}
export interface Vehicle {
  id: string;
  plate: string;
  description: string;
}
export interface Client {
  id: string;
  name: string;
}
export interface Stop {
  id: string;
  route_id: string;
  sequence: number;
  address: string;
  latitude: number;
  longitude: number;
}
export interface FiscalDocument {
  id: string;
  delivery_id: string;
  code: string;
}
export interface Delivery {
  id: string;
  route_id: string;
  stop_id: string;
  client_id: string;
  cargo_code: string;
  description: string;
  weight_kg: number;
  volume_m3: number | null;
  status: DeliveryStatus;
  checked_in_at: string | null;
  checked_out_at: string | null;
  clients: Client;
  fiscal_documents: FiscalDocument[];
}
export interface Route {
  id: string;
  code: string;
  driver_id: string;
  vehicle_id: string;
  origin: string;
  origin_lat: number;
  origin_lng: number;
  destination: string;
  scheduled_at: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  status: RouteStatus;
  profiles: Profile;
  vehicles: Vehicle;
  stops: Stop[];
  deliveries: Delivery[];
}
export interface Position {
  id: string;
  route_id: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  captured_at: string;
  received_at?: string;
}
export interface Operation {
  id: string;
  delivery_id: string;
  route_id: string;
  kind: "check_in" | "check_out";
  code: string;
  captured_at: string;
}
export interface QueueItem {
  id: string;
  kind: "operation" | "position";
  payload: Operation | Position;
  attempts: number;
  nextAttemptAt: number;
  error?: string;
}

export function nfeDigit(first43: string): number {
  if (!/^\d{43}$/.test(first43))
    throw new Error("A base da NF-e deve ter 43 dígitos.");
  let sum = 0;
  for (let i = 42, w = 2; i >= 0; i--, w = w === 9 ? 2 : w + 1)
    sum += Number(first43[i]) * w;
  const result = 11 - (sum % 11);
  return result >= 10 ? 0 : result;
}
/** Only parses text. Never visits URLs extracted from a fiscal document. */
export function normalizeFiscalCode(raw: string): string {
  if (raw.length > 4096) throw new Error("Código muito longo.");
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    /* raw scanner text remains usable */
  }
  const contiguous = value.match(/(?:^|\D)(\d{44})(?!\d)/)?.[1];
  const formatted = value.replace(/[\s.\-/]/g, "");
  const key = contiguous ?? (/^\d{44}$/.test(formatted) ? formatted : null);
  if (key) {
    if (nfeDigit(key.slice(0, 43)) !== Number(key[43]))
      throw new Error("Dígito verificador da NF-e inválido.");
    return key;
  }
  if (/^https?:/i.test(value))
    throw new Error(
      "Não foi encontrada uma chave fiscal de 44 dígitos na URL.",
    );
  value = value.toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9./_-]{0,79}$/.test(value))
    throw new Error("Informe uma chave de 44 dígitos ou o código cadastrado.");
  if (/^\d{44,}$/.test(value)) throw new Error("Chave fiscal inválida.");
  return value;
}
export function validateOperation(
  delivery: Pick<Delivery, "status" | "fiscal_documents">,
  kind: Operation["kind"],
  raw: string,
): string {
  const code = normalizeFiscalCode(raw);
  if (!delivery.fiscal_documents.some((d) => d.code === code))
    throw new Error("Documento não pertence a esta entrega.");
  if (kind === "check_in" && delivery.status !== "pendente")
    throw new Error("Esta carga já possui check-in.");
  if (kind === "check_out" && delivery.status !== "em_transporte")
    throw new Error("Faça o check-in antes de concluir a entrega.");
  return code;
}
export function backoff(attempts: number, random = Math.random()): number {
  return (
    Math.min(300_000, 1000 * 2 ** Math.min(attempts, 9)) +
    Math.floor(random * 1000)
  );
}
export async function drainQueue(
  items: QueueItem[],
  send: (item: QueueItem) => Promise<void>,
  ack: (id: string) => Promise<void>,
  retry: (item: QueueItem) => Promise<void>,
  now = Date.now(),
): Promise<void> {
  // FIFO keeps an offline check-out behind its corresponding check-in.
  for (const item of items) {
    if (item.nextAttemptAt > now) break;
    try {
      await send(item);
      await ack(item.id);
    } catch (error) {
      await retry({
        ...item,
        attempts: item.attempts + 1,
        nextAttemptAt: now + backoff(item.attempts),
        error:
          error instanceof Error ? error.message : "Falha de sincronização",
      });
      break;
    }
  }
}
export function positionFresh(
  position: Position | undefined,
  now = Date.now(),
): boolean {
  return !!position && timestampFresh(position.captured_at, now);
}
export function timestampFresh(capturedAt: string, now = Date.now()): boolean {
  const time = Date.parse(capturedAt);
  return Number.isFinite(time) && now - time < 180000 && now >= time - 30000;
}
export type ArrivalEstimate =
  | {
      status: "ready";
      arrives_at: string;
      captured_at: string;
      duration_seconds: number;
    }
  | { status: "waiting" | "stale" | "completed" | "unavailable" };
export function readArrivalEstimate(value: unknown): ArrivalEstimate {
  const item = value as Partial<{
    status: string;
    arrives_at: string;
    captured_at: string;
    duration_seconds: number;
  }> | null;
  if (
    item?.status === "ready" &&
    typeof item.arrives_at === "string" &&
    typeof item.captured_at === "string" &&
    Number.isFinite(Date.parse(item.arrives_at)) &&
    Number.isFinite(Date.parse(item.captured_at)) &&
    typeof item.duration_seconds === "number" &&
    Number.isFinite(item.duration_seconds) &&
    item.duration_seconds >= 0
  )
    return {
      status: "ready",
      arrives_at: item.arrives_at,
      captured_at: item.captured_at,
      duration_seconds: item.duration_seconds,
    };
  if (
    item &&
    ["waiting", "stale", "completed", "unavailable"].includes(item.status ?? "")
  )
    return {
      status: item.status as "waiting" | "stale" | "completed" | "unavailable",
    };
  return { status: "unavailable" };
}
export function arrivalTime(
  value: ArrivalEstimate | undefined,
  now = Date.now(),
): string | null {
  return value?.status === "ready" && timestampFresh(value.captured_at, now)
    ? new Date(value.arrives_at).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : null;
}
export function deliveryDirectionsUrl(
  route: Route,
  delivery: Delivery,
): string {
  if (
    delivery.route_id !== route.id ||
    !route.deliveries.some((d) => d.id === delivery.id)
  )
    throw new Error("Entrega não pertence a esta rota.");
  if (delivery.status !== "em_transporte")
    throw new Error("Confirme a coleta antes de abrir a rota da entrega.");
  const stop = route.stops.find((s) => s.id === delivery.stop_id);
  if (
    !stop ||
    !Number.isFinite(stop.latitude) ||
    !Number.isFinite(stop.longitude) ||
    Math.abs(stop.latitude) > 90 ||
    Math.abs(stop.longitude) > 180
  )
    throw new Error("Confira o endereço da entrega antes de abrir a rota.");
  // Omitting origin lets Maps use the driver's current location, with its permission.
  return (
    "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(stop.latitude + "," + stop.longitude) +
    "&travelmode=driving"
  );
}
export const pointSchema = z.object({
  address: z.string().min(3).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export const newRouteSchema = z.object({
  code: z.string().min(2).max(60),
  driver_id: z.uuid(),
  vehicle_id: z.uuid(),
  origin: pointSchema,
  scheduled_at: z.iso.datetime({ offset: true }).nullable(),
  deliveries: z
    .array(
      z.object({
        client_id: z.uuid(),
        destination: pointSchema,
        cargo_code: z.string().min(1).max(80),
        description: z.string().min(1).max(500),
        weight_kg: z.number().positive(),
        volume_m3: z.number().positive().nullable(),
        fiscal_code: z.string().transform((v, ctx) => {
          try {
            return normalizeFiscalCode(v);
          } catch (e) {
            ctx.addIssue({ code: "custom", message: (e as Error).message });
            return z.NEVER;
          }
        }),
      }),
    )
    .min(1)
    .max(100),
});
export type NewRoute = z.infer<typeof newRouteSchema>;
export const routeSelection =
  "*, profiles!routes_driver_id_fkey(*), vehicles(*), stops(*), deliveries(*, clients(*), fiscal_documents(*))";
export const labels: Record<string, string> = {
  planejada: "Planejada",
  ativa: "Em andamento",
  concluida: "Concluída",
  pendente: "Aguardando coleta",
  em_transporte: "Em transporte",
};

export function overlayPendingOperations(
  routes: Route[],
  events: QueueItem[],
): Route[] {
  return routes.map((r) => {
    const deliveries = r.deliveries.map((d) => {
      let result = { ...d };
      for (const event of events) {
        if (event.kind !== "operation") continue;
        const op = event.payload as Operation;
        if (op.delivery_id !== d.id) continue;
        if (op.kind === "check_in" && result.status === "pendente")
          result = {
            ...result,
            status: "em_transporte",
            checked_in_at: op.captured_at,
          };
        if (op.kind === "check_out" && result.status === "em_transporte")
          result = {
            ...result,
            status: "concluida",
            checked_out_at: op.captured_at,
          };
      }
      return result;
    });
    return {
      ...r,
      deliveries,
      status: deliveries.every((d) => d.status === "concluida")
        ? "concluida"
        : r.status,
    };
  });
}
