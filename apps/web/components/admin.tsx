"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  newRouteSchema,
  type Profile,
  type Vehicle,
  type Client,
} from "@fasttrack/core";
import { supabase } from "../lib/supabase";
import { Modal } from "./ui";
import { useDemo } from "../lib/demo";
import { AddressPicker } from "./address-picker";
import { routeEditSchema, type ManagedRoute } from "../lib/route-management";
import type { AddressPoint } from "../lib/postal-address";
type DraftDelivery = {
  id: string;
  client_id: string;
  point: AddressPoint | null;
  cargo_code: string;
  description: string;
  weight: string;
  volume: string;
  fiscal_code: string;
};
const blank = (): DraftDelivery => ({
  id: crypto.randomUUID(),
  client_id: "",
  point: null,
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
  editingRoute,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: () => void;
  editingRoute?: ManagedRoute;
}) {
  const demo = useDemo();
  const loadVersion = useRef(0);
  const [setupError, setSetupError] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(
    editingRoute?.driver_id ?? "",
  );
  const [selectedVehicle, setSelectedVehicle] = useState(
    editingRoute?.vehicle_id ?? "",
  );
  const driverLocked =
    !!editingRoute &&
    (editingRoute.status === "ativa" ||
      editingRoute.deliveries.some((d) => d.status !== "pendente"));
  const [tab, setTab] = useState("rota"),
    [drivers, setDrivers] = useState<Profile[]>([]),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [origin, setOrigin] = useState<AddressPoint | null>(
      editingRoute
        ? {
            address: editingRoute.origin,
            latitude: editingRoute.origin_lat,
            longitude: editingRoute.origin_lng,
          }
        : null,
    ),
    [deliveries, setDeliveries] = useState<DraftDelivery[]>(
      editingRoute
        ? [...editingRoute.deliveries]
            .sort(
              (a, b) =>
                (editingRoute.stops.find((s) => s.id === a.stop_id)?.sequence ??
                  0) -
                (editingRoute.stops.find((s) => s.id === b.stop_id)?.sequence ??
                  0),
            )
            .map((d) => {
              const stop = editingRoute.stops.find((s) => s.id === d.stop_id)!;
              return {
                id: d.id,
                client_id: d.client_id,
                point: {
                  address: stop.address,
                  latitude: stop.latitude,
                  longitude: stop.longitude,
                },
                cargo_code: d.cargo_code,
                description: d.description,
                weight: String(d.weight_kg),
                volume: d.volume_m3 == null ? "" : String(d.volume_m3),
                fiscal_code: d.fiscal_documents[0]?.code ?? "",
              };
            })
        : [blank()],
    ),
    [busy, setBusy] = useState(false),
    [driversBusy, setDriversBusy] = useState(false),
    [syncingDrivers, setSyncingDrivers] = useState(false),
    [error, setError] = useState(""),
    [catalogError, setCatalogError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    const version = ++loadVersion.current;
    if (demo) {
      setDrivers(demo.state.drivers);
      setVehicles(demo.state.vehicles);
      setClients(demo.state.clients);
      return;
    }
    setDriversBusy(true);
    setCatalogError("");
    const db = supabase();
    const errors: Record<string, string> = {};
    const failure = (resource: string, message: string) => {
      errors[resource] = message;
      if (version === loadVersion.current)
        setCatalogError(Object.values(errors).join(" "));
    };
    const outcomes = await Promise.allSettled([
      (async () => {
        try {
          const response = await fetch("/api/motoristas", {
            cache: "no-store",
          });
          const data = await response.json();
          if (!response.ok || !Array.isArray(data.drivers))
            throw new Error(
              data.error ?? "Não foi possível carregar os motoristas.",
            );
          if (version === loadVersion.current) setDrivers(data.drivers);
        } catch (error) {
          failure(
            "drivers",
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os motoristas.",
          );
        } finally {
          if (version === loadVersion.current) setDriversBusy(false);
        }
      })(),
      (async () => {
        try {
          const result = await db.from("vehicles").select("*");
          if (result.error) throw result.error;
          if (version === loadVersion.current)
            setVehicles((result.data ?? []) as Vehicle[]);
        } catch {
          failure("vehicles", "Não foi possível atualizar os veículos.");
        }
      })(),
      (async () => {
        try {
          const result = await db.from("clients").select("*");
          if (result.error) throw result.error;
          if (version === loadVersion.current)
            setClients((result.data ?? []) as Client[]);
        } catch {
          failure("clients", "Não foi possível atualizar os clientes.");
        }
      })(),
    ]);
    if (outcomes.some((result) => result.status === "rejected"))
      failure(
        "unexpected",
        "Uma consulta não foi concluída. Atualize os cadastros.",
      );
  }

  useEffect(() => {
    if (tab === "rota" || demo) void load();
  }, [demo?.state, tab]);
  async function synchronizeDrivers() {
    if (demo) {
      await load();
      setMessage("Lista de demonstração atualizada.");
      return;
    }
    ++loadVersion.current;
    setDriversBusy(false);
    setSyncingDrivers(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/motoristas/sincronizar", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.drivers))
        throw new Error(
          data.error ?? "Não foi possível conferir os motoristas.",
        );
      ++loadVersion.current;
      setDrivers(data.drivers);
      setMessage(
        data.drivers.length
          ? `${data.drivers.length} motorista(s) disponível(is) para esta empresa.`
          : "Nenhum motorista vinculado à sua empresa foi encontrado. Confira se o cadastro foi concluído na operação real.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncingDrivers(false);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSetupError(false);
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
          if (
            !json.ok ||
            !json.driver?.id ||
            json.driver.tenant_id !== profile.tenant_id ||
            json.driver.role !== "motorista"
          )
            throw new Error(
              "A conta não teve seu vínculo confirmado. Use Atualizar motoristas antes de cadastrar novamente.",
            );
          setDrivers((current) => [
            ...current.filter((d) => d.id !== json.driver.id),
            json.driver,
          ]);
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
        if (!origin || deliveries.some((d) => !d.point))
          throw new Error(
            "Busque o CEP e confirme o endereço da origem e de todas as entregas antes de criar a rota.",
          );
        const data = (
          editingRoute ? routeEditSchema : newRouteSchema
        ).safeParse({
          code: text("code"),
          driver_id: selectedDriver,
          vehicle_id: selectedVehicle,
          origin,
          scheduled_at: text("scheduled")
            ? new Date(text("scheduled")).toISOString()
            : null,
          deliveries: deliveries.map((d) => ({
            id: d.id,
            client_id: d.client_id,
            destination: d.point,
            cargo_code: d.cargo_code,
            description: d.description,
            weight_kg: Number(d.weight),
            volume_m3: d.volume ? Number(d.volume) : null,
            fiscal_code: d.fiscal_code,
          })),
        });
        if (!data.success)
          throw new Error(data.error.issues.map((i) => i.message).join(" "));
        if (editingRoute) {
          const response = await fetch("/api/rotas", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: editingRoute.id,
              version: editingRoute.management_version ?? 0,
              data: data.data,
            }),
          });
          const result = await response.json();
          if (!response.ok) {
            setSetupError(!!result.setup);
            throw new Error(result.error);
          }
        } else if (demo) demo.createRoute(data.data);
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
  function patch(
    i: number,
    key: Exclude<keyof DraftDelivery, "id" | "point">,
    value: string,
  ) {
    setDeliveries((ds) =>
      ds.map((d, index) => (index === i ? { ...d, [key]: value } : d)),
    );
  }
  return (
    <Modal
      title={editingRoute ? "Editar rota" : "Organize sua operação"}
      subtitle={
        editingRoute
          ? "Check-ins, check-outs e histórico GPS serão preservados."
          : "Cadastros simples para colocar a próxima entrega na estrada."
      }
      onClose={onClose}
      wide
    >
      {!editingRoute && (
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
      )}
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
                  defaultValue={editingRoute?.code}
                  required
                  placeholder="Ex.: FT-2026-001"
                  maxLength={60}
                />
              </label>
              <label>
                Saída prevista
                <input
                  name="scheduled"
                  type="datetime-local"
                  defaultValue={
                    editingRoute?.scheduled_at
                      ? new Date(
                          new Date(editingRoute.scheduled_at).getTime() -
                            new Date(
                              editingRoute.scheduled_at,
                            ).getTimezoneOffset() *
                              60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                />
              </label>
              <label>
                Motorista
                <select
                  name="driver"
                  value={selectedDriver}
                  onChange={(e) => setSelectedDriver(e.target.value)}
                  aria-label="Motorista"
                  required
                  disabled={driversBusy || syncingDrivers || driverLocked}
                >
                  <option value="">
                    {driversBusy
                      ? "Carregando motoristas…"
                      : drivers.length
                        ? "Selecione"
                        : "Nenhum motorista disponível"}
                  </option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span className="driver-catalog-actions">
                  <span>{drivers.length} motorista(s) disponível(is)</span>
                  <button
                    type="button"
                    className="text-button"
                    disabled={driversBusy || syncingDrivers}
                    onClick={() => void synchronizeDrivers()}
                  >
                    <RefreshCw size={13} />
                    {syncingDrivers ? "Conferindo…" : "Atualizar motoristas"}
                  </button>
                </span>
              </label>
              <label>
                Veículo
                <select
                  name="vehicle"
                  required
                  value={selectedVehicle}
                  onChange={(e) => setSelectedVehicle(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · {v.description}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <AddressPicker
              title="Origem da rota"
              value={origin}
              onChange={setOrigin}
            />
            <h3>
              Entregas <span className="count">{deliveries.length}</span>
            </h3>
            {deliveries.map((d, i) => (
              <fieldset
                key={d.id}
                disabled={
                  editingRoute?.deliveries.find((x) => x.id === d.id)
                    ?.status === "concluida"
                }
              >
                <legend>Entrega {i + 1}</legend>
                <div className="form-grid">
                  <label>
                    Cliente
                    <select
                      aria-label="Cliente"
                      required
                      value={d.client_id}
                      disabled={
                        !!editingRoute &&
                        editingRoute.deliveries.find((x) => x.id === d.id)
                          ?.status !== "pendente"
                      }
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
                      readOnly={
                        !!editingRoute &&
                        editingRoute.deliveries.find((x) => x.id === d.id)
                          ?.status !== "pendente"
                      }
                      onChange={(e) => patch(i, "cargo_code", e.target.value)}
                    />
                  </label>
                </div>
                <AddressPicker
                  title={`Destino da entrega ${i + 1}`}
                  value={d.point}
                  onChange={(point) =>
                    setDeliveries((current) =>
                      current.map((item) =>
                        item.id === d.id ? { ...item, point } : item,
                      ),
                    )
                  }
                />
                <label>
                  Chave NF-e ou código fiscal
                  <input
                    required
                    value={d.fiscal_code}
                    readOnly={!!editingRoute}
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
                {!editingRoute && deliveries.length > 1 && (
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
            {!editingRoute && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setDeliveries((ds) => [...ds, blank()])}
                disabled={deliveries.length >= 100}
              >
                <Plus size={16} />
                Adicionar entrega
              </button>
            )}
          </>
        )}
        {(error || (tab === "rota" && catalogError)) && (
          <p className="error" role="alert">
            {[error, tab === "rota" ? catalogError : ""]
              .filter(Boolean)
              .join(" ")}
          </p>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        {setupError && (
          <a href="/atualizacao-rotas" target="_blank" rel="noreferrer">
            Ativar edição e exclusão no Supabase
          </a>
        )}
        <footer className="form-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Salvando…"
              : editingRoute
                ? "Salvar alterações"
                : tab === "rota"
                  ? "Criar rota"
                  : "Salvar cadastro"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
