"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  newRouteSchema,
  type Profile,
  type Vehicle,
  type Client,
} from "@fasttrack/core";
import { supabase } from "../lib/supabase";
import { Modal } from "./ui";
import { useDemo } from "../lib/demo";
type DraftDelivery = {
  client_id: string;
  address: string;
  lat: string;
  lng: string;
  cargo_code: string;
  description: string;
  weight: string;
  volume: string;
  fiscal_code: string;
};
const blank = (): DraftDelivery => ({
  client_id: "",
  address: "",
  lat: "",
  lng: "",
  cargo_code: "",
  description: "",
  weight: "",
  volume: "",
  fiscal_code: "",
});
export function Admin({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const demo = useDemo();
  const [tab, setTab] = useState("rota"),
    [drivers, setDrivers] = useState<Profile[]>([]),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [deliveries, setDeliveries] = useState<DraftDelivery[]>([blank()]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    if (demo) {
      setDrivers(demo.state.drivers);
      setVehicles(demo.state.vehicles);
      setClients(demo.state.clients);
      return;
    }
    const db = supabase();
    const results = await Promise.all([
      db.from("profiles").select("*").eq("role", "motorista"),
      db.from("vehicles").select("*"),
      db.from("clients").select("*"),
    ]);
    const failure = results.find((r) => r.error);
    if (failure?.error) {
      setError(failure.error.message);
      return;
    }
    setDrivers(results[0].data as unknown as Profile[]);
    setVehicles(results[1].data as unknown as Vehicle[]);
    setClients(results[2].data as unknown as Client[]);
  }
  useEffect(() => {
    void load();
  }, [demo?.state]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = e.currentTarget;
    const f = new FormData(form);
    const text = (k: string) => String(f.get(k) ?? "");
    try {
      if (tab === "motorista") {
        if (demo) demo.addDriver(text("name"), text("phone"));
        else {
          const r = await fetch("/api/motoristas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: text("name"),
              email: text("email"),
              phone: text("phone"),
              password: text("password"),
            }),
          });
          const json = await r.json();
          if (!r.ok) throw new Error(json.error);
        }
      } else if (tab === "veiculo" || tab === "cliente") {
        if (demo) {
          if (tab === "veiculo")
            demo.addVehicle(text("plate"), text("description"));
          else demo.addClient(text("name"));
        } else {
          const { error: e } = await supabase()
            .from(tab === "veiculo" ? "vehicles" : "clients")
            .insert(
              tab === "veiculo"
                ? {
                    tenant_id: profile.tenant_id,
                    plate: text("plate").toUpperCase(),
                    description: text("description"),
                  }
                : { tenant_id: profile.tenant_id, name: text("name") },
            );
          if (e) throw e;
        }
      } else {
        const data = newRouteSchema.safeParse({
          code: text("code"),
          driver_id: text("driver"),
          vehicle_id: text("vehicle"),
          origin: {
            address: text("origin"),
            latitude: Number(text("origin_lat")),
            longitude: Number(text("origin_lng")),
          },
          scheduled_at: text("scheduled")
            ? new Date(text("scheduled")).toISOString()
            : null,
          deliveries: deliveries.map((d) => ({
            client_id: d.client_id,
            destination: {
              address: d.address,
              latitude: Number(d.lat),
              longitude: Number(d.lng),
            },
            cargo_code: d.cargo_code,
            description: d.description,
            weight_kg: Number(d.weight),
            volume_m3: d.volume ? Number(d.volume) : null,
            fiscal_code: d.fiscal_code,
          })),
        });
        if (!data.success)
          throw new Error(data.error.issues.map((i) => i.message).join(" "));
        if (demo) demo.createRoute(data.data);
        else {
          const { error: e } = await supabase().rpc("create_route", {
            payload: data.data,
          });
          if (e) throw e;
        }
        onSaved();
        onClose();
        return;
      }
      form.reset();
      setMessage("Cadastro salvo.");
      await load();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function patch(i: number, key: keyof DraftDelivery, value: string) {
    setDeliveries((ds) =>
      ds.map((d, index) => (index === i ? { ...d, [key]: value } : d)),
    );
  }
  return (
    <Modal
      title="Organize sua operação"
      subtitle="Cadastros simples para colocar a próxima entrega na estrada."
      onClose={onClose}
      wide
    >
      <div className="tabs">
        {[
          ["rota", "Nova rota"],
          ["motorista", "Motorista"],
          ["veiculo", "Veículo"],
          ["cliente", "Cliente"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={tab === v ? "selected" : ""}
            onClick={() => {
              setTab(v);
              setError("");
              setMessage("");
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <form key={tab} className="admin-form" onSubmit={save}>
        {demo && (
          <p className="notice">
            Cadastro fictício de apresentação. Não informe senhas ou dados
            pessoais reais. Nenhuma conta de acesso será criada.
          </p>
        )}
        {tab === "motorista" && (
          <>
            <label>
              Nome completo
              <input name="name" required minLength={3} />
            </label>
            <div className="form-grid">
              <label>
                E-mail
                <input name="email" type="email" required />
              </label>
              <label>
                Telefone
                <input name="phone" type="tel" required />
              </label>
            </div>
            <label>
              Senha inicial
              <input
                name="password"
                type="password"
                disabled={!!demo}
                autoComplete="new-password"
                minLength={12}
                required={!demo}
              />
            </label>
            <p className="muted">
              Entregue a senha ao motorista por um canal seguro. A conta
              pertencerá à sua empresa.
            </p>
          </>
        )}
        {tab === "veiculo" && (
          <div className="form-grid">
            <label>
              Placa
              <input
                name="plate"
                required
                maxLength={10}
                placeholder="ABC1D23"
              />
            </label>
            <label>
              Descrição
              <input name="description" required placeholder="Caminhão baú" />
            </label>
          </div>
        )}
        {tab === "cliente" && (
          <label>
            Nome do cliente
            <input name="name" required minLength={2} maxLength={200} />
          </label>
        )}
        {tab === "rota" && (
          <>
            <div className="form-grid">
              <label>
                Identificação da rota
                <input
                  name="code"
                  required
                  placeholder="Ex.: FT-2026-001"
                  maxLength={60}
                />
              </label>
              <label>
                Saída prevista
                <input name="scheduled" type="datetime-local" />
              </label>
              <label>
                Motorista
                <select name="driver" required>
                  <option value="">Selecione</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Veículo
                <select name="vehicle" required>
                  <option value="">Selecione</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · {v.description}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Origem · endereço
              <input name="origin" required />
            </label>
            <div className="form-grid">
              <label>
                Latitude da origem
                <input
                  name="origin_lat"
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  required
                />
              </label>
              <label>
                Longitude da origem
                <input
                  name="origin_lng"
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  required
                />
              </label>
            </div>
            <p className="muted">
              Use coordenadas verificadas do endereço. O trajeto pelas vias será
              consultado no mapa; não geramos posições fictícias.
            </p>
            <h3>
              Entregas <span className="count">{deliveries.length}</span>
            </h3>
            {deliveries.map((d, i) => (
              <fieldset key={i}>
                <legend>Entrega {i + 1}</legend>
                <div className="form-grid">
                  <label>
                    Cliente
                    <select
                      aria-label="Cliente"
                      required
                      value={d.client_id}
                      onChange={(e) => patch(i, "client_id", e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Código da carga
                    <input
                      required
                      value={d.cargo_code}
                      onChange={(e) => patch(i, "cargo_code", e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Destino · endereço
                  <input
                    required
                    value={d.address}
                    onChange={(e) => patch(i, "address", e.target.value)}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Latitude
                    <input
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      required
                      value={d.lat}
                      onChange={(e) => patch(i, "lat", e.target.value)}
                    />
                  </label>
                  <label>
                    Longitude
                    <input
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      required
                      value={d.lng}
                      onChange={(e) => patch(i, "lng", e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Chave NF-e ou código fiscal
                  <input
                    required
                    value={d.fiscal_code}
                    onChange={(e) => patch(i, "fiscal_code", e.target.value)}
                  />
                </label>
                <label>
                  Descrição da carga
                  <input
                    required
                    value={d.description}
                    onChange={(e) => patch(i, "description", e.target.value)}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Peso (kg)
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={d.weight}
                      onChange={(e) => patch(i, "weight", e.target.value)}
                    />
                  </label>
                  <label>
                    Volume (m³) · opcional
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={d.volume}
                      onChange={(e) => patch(i, "volume", e.target.value)}
                    />
                  </label>
                </div>
                {deliveries.length > 1 && (
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() =>
                      setDeliveries((ds) => ds.filter((_, j) => i !== j))
                    }
                  >
                    <Trash2 size={15} />
                    Remover entrega
                  </button>
                )}
              </fieldset>
            ))}
            <button
              type="button"
              className="button secondary"
              onClick={() => setDeliveries((ds) => [...ds, blank()])}
              disabled={deliveries.length >= 100}
            >
              <Plus size={16} />
              Adicionar entrega
            </button>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        <footer className="form-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Salvando…"
              : tab === "rota"
                ? "Criar rota"
                : "Salvar cadastro"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
