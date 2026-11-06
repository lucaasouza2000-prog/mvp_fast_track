"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Search } from "lucide-react";
import {
  demoPostalAddress,
  formatCep,
  normalizeCep,
  type AddressPoint,
  type PostalAddress,
} from "../lib/postal-address";
import { useDemo } from "../lib/demo";
const AddressMap = dynamic(() => import("./address-map"), {
  ssr: false,
  loading: () => <p className="muted">Carregando mapa…</p>,
});
export function AddressPicker({
  title,
  value,
  onChange,
}: {
  title: string;
  value: AddressPoint | null;
  onChange: (value: AddressPoint | null) => void;
}) {
  const demo = useDemo();
  const [cep, setCep] = useState(""),
    [result, setResult] = useState<PostalAddress | null>(null),
    [street, setStreet] = useState(""),
    [number, setNumber] = useState(""),
    [complement, setComplement] = useState(""),
    [point, setPoint] = useState<PostalAddress["point"]>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [generation, setGeneration] = useState(0);
  const request = useRef<AbortController | null>(null),
    version = useRef(0);
  useEffect(
    () => () => {
      request.current?.abort();
      version.current++;
    },
    [],
  );
  function invalidate() {
    onChange(null);
  }
  async function find() {
    request.current?.abort();
    const current = ++version.current;
    const controller = new AbortController();
    request.current = controller;
    invalidate();
    setError("");
    setResult(null);
    setPoint(null);
    setBusy(true);
    try {
      const digits = normalizeCep(cep);
      let data: PostalAddress;
      if (demo) data = demoPostalAddress(digits);
      else {
        const response = await fetch(`/api/cep?cep=${digits}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const json = await response.json();
        if (!response.ok)
          throw new Error(json.error ?? "Não foi possível consultar o CEP.");
        data = json;
      }
      if (current !== version.current) return;
      setResult(data);
      setStreet(data.street);
      setPoint(data.point);
      setGeneration((n) => n + 1);
    } catch (e) {
      if (current === version.current && !controller.signal.aborted)
        setError((e as Error).message);
    } finally {
      if (current === version.current) setBusy(false);
    }
  }
  function confirm() {
    if (!result || !street.trim() || !number.trim() || !point) {
      setError(
        "Informe rua e número, e marque o ponto no mapa antes de confirmar.",
      );
      return;
    }
    const address = `${street.trim()}, ${number.trim()}${complement.trim() ? ` · ${complement.trim()}` : ""} — ${result.neighborhood ? result.neighborhood + " · " : ""}${result.city}/${result.state} · CEP ${formatCep(result.cep)}${demo ? " · fictício" : ""}`;
    onChange({ address, ...point });
    setError("");
  }
  return (
    <section className="address-picker" role="group" aria-label={title}>
      <h3>{title}</h3>
      <div className="address-lookup">
        <label>
          CEP
          <input
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={9}
            value={cep}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void find();
              }
            }}
            onChange={(e) => {
              request.current?.abort();
              version.current++;
              setBusy(false);
              setCep(formatCep(e.target.value));
              setNumber("");
              setComplement("");
              setResult(null);
              setPoint(null);
              setError("");
              invalidate();
            }}
            placeholder={demo ? "00000-001" : "00000-000"}
          />
        </label>
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={() => void find()}
        >
          <Search size={15} />
          {busy ? "Buscando…" : "Buscar CEP"}
        </button>
      </div>
      {demo && (
        <p className="muted">
          Exemplos fictícios: 00000-001 (Londrina), 00000-002 (Maringá),
          00000-003 (Campo Mourão).
        </p>
      )}
      {result && (
        <>
          <label>
            Rua ou avenida
            <input
              value={street}
              onChange={(e) => {
                setStreet(e.target.value);
                invalidate();
              }}
              placeholder="Informe o logradouro, se o CEP for geral"
            />
          </label>
          <div className="form-grid">
            <label>
              Número
              <input
                value={number}
                maxLength={20}
                onChange={(e) => {
                  setNumber(e.target.value);
                  invalidate();
                }}
                placeholder="Ex.: 120 ou S/N"
              />
            </label>
            <label>
              Complemento · opcional
              <input
                value={complement}
                maxLength={100}
                onChange={(e) => {
                  setComplement(e.target.value);
                  invalidate();
                }}
                placeholder="Ex.: galpão 2"
              />
            </label>
          </div>
          <p className="address-city">
            {result.neighborhood ? result.neighborhood + " · " : ""}
            {result.city}/{result.state}
          </p>
          <p className="muted">
            {demo
              ? "Este endereço e o ponto são fictícios para a apresentação."
              : "O ponto encontrado pelo CEP é aproximado e não considera o número do imóvel. Confira o local; clique no mapa ou arraste o pino até a entrada correta."}
          </p>
          {!value && (
            <AddressMap
              key={`${result.cep}-${generation}`}
              initial={point}
              onPoint={(value) => {
                setPoint(value);
                invalidate();
              }}
            />
          )}
          {point && (
            <a
              className="text-button"
              href={`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=17/${point.latitude}/${point.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Conferir ponto no OpenStreetMap ↗
            </a>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={!point || !street.trim() || !number.trim()}
            onClick={confirm}
          >
            <Check size={15} />
            Confirmar endereço
          </button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {value && (
        <>
          <p className="success" role="status">
            Endereço confirmado: {value.address}
          </p>
          <button type="button" className="text-button" onClick={invalidate}>
            Alterar endereço ou ponto
          </button>
        </>
      )}
    </section>
  );
}
