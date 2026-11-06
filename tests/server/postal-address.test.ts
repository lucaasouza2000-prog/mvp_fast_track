import { describe, expect, it } from "vitest";
import {
  demoPostalAddress,
  formatCep,
  lookupPostalAddress,
  normalizeCep,
  normalizePostalResponse,
} from "../../apps/web/lib/postal-address";
const raw = {
  cep: "86010000",
  street: "Rua de exemplo",
  neighborhood: "Centro",
  city: "Londrina",
  state: "PR",
  location: { coordinates: { latitude: "-23.31", longitude: "-51.16" } },
};
describe("busca de endereço por CEP", () => {
  it("normaliza o CEP e recusa quantidade incorreta de dígitos", () => {
    expect(normalizeCep("86010-000")).toBe("86010000");
    expect(formatCep("86010000")).toBe("86010-000");
    expect(() => normalizeCep("8601")).toThrow("8 dígitos");
  });
  it("retorna endereço e ponto aproximado somente quando o serviço fornece números válidos", () => {
    expect(normalizePostalResponse(raw, "86010000", "brasilapi")).toMatchObject(
      { city: "Londrina", point: { latitude: -23.31, longitude: -51.16 } },
    );
    expect(
      normalizePostalResponse(
        { ...raw, location: { coordinates: { latitude: "", longitude: "" } } },
        "86010000",
        "brasilapi",
      ).point,
    ).toBeNull();
    expect(
      normalizePostalResponse(
        {
          ...raw,
          location: { coordinates: { latitude: "0", longitude: "0" } },
        },
        "86010000",
        "brasilapi",
      ).point,
    ).toBeNull();
    expect(
      normalizePostalResponse(
        {
          ...raw,
          location: { coordinates: { latitude: "95", longitude: "-51" } },
        },
        "86010000",
        "brasilapi",
      ).point,
    ).toBeNull();
  });
  it("não aceita um endereço de outro CEP nem inventa coordenadas no ViaCEP", () => {
    expect(() =>
      normalizePostalResponse(
        { ...raw, cep: "00000000" },
        "86010000",
        "brasilapi",
      ),
    ).toThrow("não confirmou");
    expect(
      normalizePostalResponse(
        {
          cep: "86010-000",
          logradouro: "Rua Teste",
          bairro: "Centro",
          localidade: "Londrina",
          uf: "PR",
        },
        "86010000",
        "viacep",
      ).point,
    ).toBeNull();
  });
  it("usa ViaCEP como alternativa quando a primeira consulta falha", async () => {
    const calls: string[] = [];
    const request: typeof fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("brasilapi")) throw new Error("offline");
      return Response.json({
        cep: "86010-000",
        logradouro: "Rua Teste",
        bairro: "Centro",
        localidade: "Londrina",
        uf: "PR",
      });
    };
    const result = await lookupPostalAddress("86010-000", request);
    expect(result.source).toBe("viacep");
    expect(result.point).toBeNull();
    expect(calls).toHaveLength(2);
  });
  it("distingue CEP inexistente de serviço indisponível", async () => {
    await expect(
      lookupPostalAddress("86010000", async () =>
        Response.json({ erro: true }, { status: 404 }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      lookupPostalAddress("86010000", async () => {
        throw new Error("network");
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("mantém CEPs fictícios restritos ao exemplo local", () => {
    expect(demoPostalAddress("00000-001")).toMatchObject({
      source: "demo",
      city: "Londrina",
    });
    expect(() => demoPostalAddress("86010000")).toThrow("Na demonstração");
  });
});
