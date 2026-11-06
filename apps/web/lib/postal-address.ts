export interface AddressPoint {
  address: string;
  latitude: number;
  longitude: number;
}
export interface PostalAddress {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  point: { latitude: number; longitude: number } | null;
  source: "brasilapi" | "viacep" | "demo";
}
export class PostalLookupError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
export function normalizeCep(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{8}$/.test(digits))
    throw new PostalLookupError("Informe um CEP com 8 dígitos.", 400);
  return digits;
}
export function formatCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5
    ? digits.slice(0, 5) + "-" + digits.slice(5)
    : digits;
}
export function normalizePostalResponse(
  raw: unknown,
  cep: string,
  source: "brasilapi" | "viacep",
): PostalAddress {
  if (!raw || typeof raw !== "object")
    throw new PostalLookupError(
      "O serviço de CEP não retornou um endereço válido.",
      503,
    );
  const data = raw as Record<string, unknown>;
  if (data.erro === true || data.erro === "true")
    throw new PostalLookupError("CEP não encontrado. Confira os números.", 404);
  if (text(data.cep).replace(/\D/g, "") !== cep)
    throw new PostalLookupError(
      "O serviço não confirmou o CEP informado.",
      503,
    );
  const city = text(data.city ?? data.localidade),
    state = text(data.state ?? data.uf);
  if (!city || !/^[A-Z]{2}$/.test(state))
    throw new PostalLookupError(
      "O serviço não confirmou a cidade e o estado.",
      503,
    );
  let point: PostalAddress["point"] = null;
  const coords = (
    data.location as
      { coordinates?: { latitude?: unknown; longitude?: unknown } } | undefined
  )?.coordinates;
  if (
    coords &&
    String(coords.latitude ?? "").trim() &&
    String(coords.longitude ?? "").trim()
  ) {
    const latitude = Number(coords.latitude),
      longitude = Number(coords.longitude);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180 &&
      (latitude !== 0 || longitude !== 0)
    )
      point = { latitude, longitude };
  }
  return {
    cep,
    street: text(data.street ?? data.logradouro),
    neighborhood: text(data.neighborhood ?? data.bairro),
    city,
    state,
    point,
    source,
  };
}
export async function lookupPostalAddress(
  rawCep: string,
  request: typeof fetch = fetch,
): Promise<PostalAddress> {
  const cep = normalizeCep(rawCep);
  let notFound = false;
  for (const [source, url] of [
    ["brasilapi", `https://brasilapi.com.br/api/cep/v2/${cep}`],
    ["viacep", `https://viacep.com.br/ws/${cep}/json/`],
  ] as const) {
    try {
      const response = await request(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "FastTrack/0.1 (+https://mvpfasttrack.vercel.app)",
        },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (response.status === 404) {
        notFound = true;
        continue;
      }
      if (!response.ok) continue;
      return normalizePostalResponse(await response.json(), cep, source);
    } catch (error) {
      if (error instanceof PostalLookupError && error.status === 404)
        notFound = true;
    }
  }
  throw new PostalLookupError(
    notFound
      ? "CEP não encontrado. Confira os números."
      : "O serviço de CEP está indisponível. Tente novamente em instantes.",
    notFound ? 404 : 503,
  );
}
export function demoPostalAddress(raw: string): PostalAddress {
  const cep = normalizeCep(raw);
  const examples: Record<
    string,
    { city: string; latitude: number; longitude: number }
  > = {
    "00000001": { city: "Londrina", latitude: -23.3103, longitude: -51.1628 },
    "00000002": { city: "Maringá", latitude: -23.4205, longitude: -51.9333 },
    "00000003": {
      city: "Campo Mourão",
      latitude: -24.0458,
      longitude: -52.3839,
    },
  };
  const sample = examples[cep];
  if (!sample)
    throw new PostalLookupError(
      "Na demonstração, use 00000-001 (Londrina), 00000-002 (Maringá) ou 00000-003 (Campo Mourão). São CEPs fictícios.",
      400,
    );
  return {
    cep,
    street: "Rua de exemplo",
    neighborhood: "Bairro fictício",
    city: sample.city,
    state: "PR",
    point: { latitude: sample.latitude, longitude: sample.longitude },
    source: "demo",
  };
}
