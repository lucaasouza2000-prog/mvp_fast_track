"use client";
import { useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  MapPin,
  PackageCheck,
  Smartphone,
} from "lucide-react";
import {
  labels,
  validateOperation,
  type Delivery,
  type Route,
} from "@fasttrack/core";
import {
  Header,
  Connection,
  SetupNotice,
  Empty,
  Modal,
} from "../../components/ui";
import { Scanner } from "../../components/scanner";
import { useWorkspace } from "../../lib/use-workspace";
import { supabase } from "../../lib/supabase";
export default function Driver() {
  const { profile, routes, loading, error, reload } = useWorkspace("motorista");
  const [selected, setSelected] = useState<string | null>(null),
    [operation, setOperation] = useState<{
      route: Route;
      delivery: Delivery;
      kind: "check_in" | "check_out";
    } | null>(null),
    [code, setCode] = useState(""),
    [camera, setCamera] = useState(false),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(""),
    [failure, setFailure] = useState("");
  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!operation) return;
    setBusy(true);
    setFailure("");
    try {
      if (!navigator.onLine)
        throw new Error(
          "No navegador, esta operação exige internet. Utilize o aplicativo Android para operar offline.",
        );
      const normalized = validateOperation(
        operation.delivery,
        operation.kind,
        code,
      );
      const { error: e } = await supabase().rpc("record_operation", {
        p_event: {
          id: crypto.randomUUID(),
          route_id: operation.route.id,
          delivery_id: operation.delivery.id,
          kind: operation.kind,
          code: normalized,
          captured_at: new Date().toISOString(),
        },
      });
      if (e) throw e;
      setOperation(null);
      setFeedback(
        operation.kind === "check_in"
          ? "Posse da carga confirmada."
          : "Entrega concluída com sucesso.",
      );
      await reload();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header profile={profile} driver />
      <main className="driver-page">
        <div className="driver-greeting">
          <span className="eyebrow">
            OLÁ, {profile?.name.split(" ")[0].toUpperCase() ?? "MOTORISTA"}
          </span>
          <Connection />
        </div>
        <h1>
          Suas rotas<span>.</span>
        </h1>
        <p className="subheading">Cada entrega, um novo destino.</p>
        <div className="native-notice">
          <Smartphone size={22} />
          <div>
            <strong>Na estrada, use o aplicativo Android</strong>
            <p>
              GPS com tela bloqueada e operações offline exigem a versão nativa.
              Esta página permite consultas e confirmações com internet.
            </p>
          </div>
        </div>
        <SetupNotice />
        {error && <p className="error">{error}</p>}
        {feedback && (
          <p className="success" role="status">
            <Check size={17} />
            {feedback}
          </p>
        )}
        {loading ? (
          <p>Carregando rotas…</p>
        ) : routes.length ? (
          routes.map((r) => (
            <article key={r.id} className="route-card">
              <header>
                <span className="route-code">{r.code}</span>
                <span className={`badge ${r.status}`}>{labels[r.status]}</span>
              </header>
              <div className="route-destinations">
                <div>
                  <i className="dot blue" />
                  {r.origin}
                </div>
                <span className="route-dots" />
                <div>
                  <MapPin size={16} />
                  {r.destination}
                </div>
              </div>
              <footer>
                <span>
                  {r.deliveries.filter((d) => d.status === "concluida").length}/
                  {r.deliveries.length} entregas concluídas · {r.vehicles.plate}
                </span>
                <button
                  className="text-button"
                  onClick={() => setSelected(selected === r.id ? null : r.id)}
                >
                  {selected === r.id ? "Recolher" : "Ver rota"}
                  <ArrowRight size={16} />
                </button>
              </footer>
              {selected === r.id && (
                <div className="driver-deliveries">
                  {[...r.deliveries]
                    .sort(
                      (a, b) =>
                        (r.stops.find((s) => s.id === a.stop_id)?.sequence ??
                          0) -
                        (r.stops.find((s) => s.id === b.stop_id)?.sequence ??
                          0),
                    )
                    .map((d) => (
                      <div className="driver-delivery" key={d.id}>
                        <PackageCheck size={21} />
                        <div>
                          <strong>{d.clients.name}</strong>
                          <small>
                            {d.cargo_code} ·{" "}
                            {r.stops.find((s) => s.id === d.stop_id)?.address}
                          </small>
                          <span className={`badge ${d.status}`}>
                            {labels[d.status]}
                          </span>
                        </div>
                        {d.status !== "concluida" && (
                          <button
                            className="button secondary"
                            onClick={() => {
                              setOperation({
                                route: r,
                                delivery: d,
                                kind:
                                  d.status === "pendente"
                                    ? "check_in"
                                    : "check_out",
                              });
                              setCode("");
                              setFailure("");
                              setCamera(false);
                            }}
                          >
                            {d.status === "pendente" ? "Check-in" : "Check-out"}
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </article>
          ))
        ) : (
          <Empty>
            <h3>Nenhuma rota atribuída</h3>
            <p>As rotas cadastradas pelo gestor aparecerão aqui.</p>
          </Empty>
        )}
        <footer className="page-footer">
          {profile?.name ?? "FastTrack"} · Sua próxima entrega começa aqui.
        </footer>
      </main>
      {operation && (
        <Modal
          title={
            operation.kind === "check_in"
              ? "Confirmar posse da carga"
              : "Concluir entrega"
          }
          subtitle={`${operation.delivery.clients.name} · ${operation.delivery.cargo_code}`}
          onClose={() => setOperation(null)}
        >
          <form className="admin-form" onSubmit={confirm}>
            {camera && (
              <Scanner
                onRead={(value) => {
                  setCode(value);
                  setCamera(false);
                }}
              />
            )}
            <button
              type="button"
              className="button secondary full"
              onClick={() => setCamera((v) => !v)}
            >
              <Camera size={18} />
              {camera ? "Fechar câmera" : "Ler documento pela câmera"}
            </button>
            <label>
              Código fiscal ou chave NF-e
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Leia ou digite o código da nota"
              />
            </label>
            <p className="muted">
              O código será comparado com o documento desta entrega. Isso não
              consulta a situação fiscal na SEFAZ.
            </p>
            {failure && (
              <p className="error" role="alert">
                {failure}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? "Registrando…" : "Confirmar registro"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
